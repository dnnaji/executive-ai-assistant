import type { ChatMessage, ToolResult } from "./types";
import { LLM } from "./llm";
import { CliLLM } from "./llm_cli";
import { TOOLS, toolSchemasForLLM } from "./tools";

export class AgentRunner {
  private llm: { chat: (messages: ChatMessage[], tools?: any[]) => Promise<any> };
  private maxSteps: number;

  constructor(opts?: { llm?: LLM | CliLLM; maxSteps?: number }) {
    this.llm = opts?.llm ?? new CliLLM();
    this.maxSteps = opts?.maxSteps ?? 8;
  }

  async run(userGoal: string, memory?: ChatMessage[]): Promise<string> {
    const messages: ChatMessage[] = [
      { role: "system", content: `You are a helpful, reliable agent.\nYou can either:\n- Call a tool when needed (choose one)\n- Or produce a final answer.\n\nRules:\n- Be concise and accurate.\n- If you use a tool, think step-by-step but only return tool calls, not hidden thoughts.\n- Stop when the user's task is satisfied.` },
    ];
    if (memory && memory.length > 0) messages.push(...memory);
    messages.push({ role: "user", content: userGoal });

    const tools = toolSchemasForLLM();

    for (let step = 0; step < this.maxSteps; step++) {
      const resp = await this.llm.chat(messages, tools);
      const choice = resp.choices?.[0];
      const assistantMessage = choice?.message as any;
      const toolCalls = assistantMessage?.tool_calls ?? [];

      if (toolCalls && toolCalls.length > 0) {
        for (const call of toolCalls) {
          const name = call.function?.name;
          const argsJson = call.function?.arguments ?? "{}";
          let observation: ToolResult | { error: string };
          const tool = name ? TOOLS[name] : undefined;
          if (!tool || !name) {
            observation = { error: `Unknown tool: ${name}` } as any;
          } else {
            try {
              const args = JSON.parse(argsJson);
              const result = await tool.execute(args);
              observation = result;
            } catch (e) {
              observation = { error: String(e) } as any;
            }
          }

          // Echo assistant message with tool_calls, then the tool result
          // Only append the assistant message once per step
          if (!messages[messages.length - 1] || messages[messages.length - 1]?.role !== "assistant") {
            messages.push({
              role: "assistant",
              content: "",
              tool_calls: toolCalls,
            } as any);
          }
          messages.push({ role: "tool", content: JSON.stringify(observation), name, tool_call_id: (call as any).id });
        }
        continue; // let LLM incorporate observations
      }

      const content = choice?.message?.content?.trim();
      if (content) return content;
    }

    return "Stopped due to reaching step limit. Provide clearer instructions or enable more steps.";
  }
}
