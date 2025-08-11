import type { ChatProvider } from "./types";
import type { ChatMessage } from "../chat/types";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class CliProvider implements ChatProvider {
  constructor(private command: string = "ai") {}

  async chat(messages: ChatMessage[]): Promise<string> {
    const sys = messages.find((m) => m.role === "system")?.content ?? "";
    const user = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const prompt = `SYSTEM:\n${sys}\n\nUSER:\n${user}`;
    const { stdout } = await execFileAsync(this.command, [prompt], { maxBuffer: 2_000_000 });
    return stdout.trim();
  }
}
