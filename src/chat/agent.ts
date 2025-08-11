import type { ChatMessage } from "./types";
import type { ChatProvider } from "../providers/types";
import { VercelProvider } from "../providers/vercel";
import { CliProvider } from "../providers/cli";

export class ChatAgent {
  private provider: ChatProvider;

  constructor(provider?: ChatProvider) {
    if (provider) {
      this.provider = provider;
      return;
    }

    const override = (process.env.EAIA_PROVIDER || "").toLowerCase();
    const cliAvailable = isAiCliAvailable();
    const hasOpenAI = !!process.env.OPENAI_API_KEY;

    if (override === "cli") {
      if (!cliAvailable) throw new Error("EAIA_PROVIDER=cli but 'ai' CLI not found in PATH");
      this.provider = new CliProvider();
      return;
    }
    if (override === "vercel") {
      if (!hasOpenAI) throw new Error("EAIA_PROVIDER=vercel requires OPENAI_API_KEY");
      this.provider = new VercelProvider();
      return;
    }

    // Default preference: use CLI when available; otherwise use Vercel when key is present
    if (cliAvailable) {
      this.provider = new CliProvider();
      return;
    }
    if (hasOpenAI) {
      this.provider = new VercelProvider();
      return;
    }
    throw new Error("No chat provider available. Install 'ai' CLI or set OPENAI_API_KEY.");
  }

  chat(message: string, history: ChatMessage[] = []) {
    const messages: ChatMessage[] = [
      { role: "system", content: "You are a helpful assistant." },
      ...history,
      { role: "user", content: message },
    ];
    return this.provider.chat(messages);
  }
}

function isAiCliAvailable(): boolean {
  const path = Bun.which("ai");
  return typeof path === "string" && path.length > 0;
}
