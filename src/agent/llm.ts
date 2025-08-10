import OpenAI from "openai";
import type { ChatMessage, ToolSchema } from "./types";

export class LLM {
  private client: OpenAI;
  private model: string;
  private temperature: number;

  constructor(opts?: { model?: string; temperature?: number }) {
    this.client = new OpenAI({});
    this.model = opts?.model ?? "gpt-4o-mini";
    this.temperature = opts?.temperature ?? 0.2;
  }

  async chat(
    messages: ChatMessage[],
    tools?: ToolSchema[]
  ) {
    const resp = await this.client.chat.completions.create({
      model: this.model,
      temperature: this.temperature,
      messages: messages as any,
      tools: tools?.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters as any,
        },
      })),
      tool_choice: tools && tools.length > 0 ? "auto" : undefined,
    });
    return resp;
  }
}
