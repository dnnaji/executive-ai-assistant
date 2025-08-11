import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import type { ChatProvider } from "./types";
import type { ChatMessage } from "../chat/types";

export class VercelProvider implements ChatProvider {
  async chat(messages: ChatMessage[]): Promise<string> {
    const result = await streamText({
      model: openai("gpt-4o-mini"),
      messages: messages.map((m) => ({ role: m.role as any, content: m.content })),
    });
    return await (result as any).text;
  }
}
