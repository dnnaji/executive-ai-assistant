import type { ChatMessage } from "./types";
import type { ChatProvider } from "../providers/types";
import { VercelProvider } from "../providers/vercel";
import { CliProvider } from "../providers/cli";

export class ChatAgent {
  private provider: ChatProvider;

  constructor(provider?: ChatProvider) {
    if (provider) {
      this.provider = provider;
    } else {
      this.provider = process.env.OPENAI_API_KEY ? new VercelProvider() : new CliProvider();
    }
  }

  async chat(message: string, history: ChatMessage[] = []): Promise<string> {
    const messages: ChatMessage[] = [
      { role: "system", content: "You are a helpful assistant." },
      ...history,
      { role: "user", content: message },
    ];
    return await this.provider.chat(messages);
  }
}
