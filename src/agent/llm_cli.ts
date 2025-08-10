import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ChatMessage, ToolSchema } from "./types";

const execFileAsync = promisify(execFile);

/**
 * CLI-backed LLM that shells out to a local `ai` command.
 * Protocol:
 * - If tools are provided, we send a compact prompt including tools JSON schema.
 * - We expect either:
 *   a) a JSON with { tool_calls: [{ id, function: { name, arguments }}, ...] }
 *   b) or plain text final answer.
 */
export class CliLLM {
  constructor(private command: string = "ai") {}

  async chat(messages: ChatMessage[], tools?: ToolSchema[]) {
    const sys = messages.find((m: ChatMessage) => m.role === "system")?.content ?? "";
    const user = [...messages].reverse().find((m: ChatMessage) => m.role === "user")?.content ?? "";

    const toolSpec = tools && tools.length > 0 ?
      `\nTOOLS(JSON Schema):\n${JSON.stringify(tools, null, 2)}\n` : "";

    const prompt = `SYSTEM:\n${sys}\n\nUSER:\n${user}${toolSpec}\n\nRespond with either:\n- JSON: {\n  "tool_calls": [{"id": "id-1", "type": "function", "function": {"name": "tool_name", "arguments": "{...}"}}]\n}\n- OR final text answer.`;

    const { stdout } = await execFileAsync(this.command, [prompt], { maxBuffer: 2_000_000 });

    let toolCalls: any[] | undefined;
    try {
      const parsed = JSON.parse(stdout.trim());
      if (Array.isArray(parsed.tool_calls)) toolCalls = parsed.tool_calls;
    } catch { /* not JSON, treat as final text */ }

    return {
      choices: [
        {
          message: toolCalls ? { role: "assistant", content: "", tool_calls: toolCalls } : { role: "assistant", content: stdout.trim() },
        },
      ],
    } as any;
  }
}
