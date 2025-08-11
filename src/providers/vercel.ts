import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import type { ChatProvider } from "./types";
import type { ChatMessage } from "../chat/types";
import { ResultAsync } from "neverthrow";
import { createProviderError } from "../utils/errors";
import type { ChatError } from "../types/errors";

export class VercelProvider implements ChatProvider {
  chat(messages: ChatMessage[]): ResultAsync<string, ChatError> {
    return ResultAsync.fromPromise(
      (async () => {
        const result = await streamText({
          model: openai("gpt-4o-mini"),
          messages: messages.map((m) => ({ role: m.role as any, content: m.content })),
        });
        const text = await result.text;
        return text;
      })(),
      (e) => createProviderError("vercel", `AI SDK error: ${String(e)}`, e)
    );
  }
}
