import type { ChatProvider } from "./types";
import type { ChatMessage } from "../chat/types";
import { ResultAsync } from "neverthrow";
import { createProviderError } from "../utils/errors";
import type { ChatError } from "../types/errors";
// Use Bun-native process APIs

export class CliProvider implements ChatProvider {
  constructor(private command: string = "ai") {}

  chat(messages: ChatMessage[]): ResultAsync<string, ChatError> {
    return ResultAsync.fromPromise(this.perform(messages), (e) =>
      createProviderError("cli", `CLI '${this.command}' failed: ${String(e)}`, e)
    );
  }

  private async perform(messages: ChatMessage[]): Promise<string> {
    const sys = messages.find((m) => m.role === "system")?.content ?? "";
    const user = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const prompt = `SYSTEM:\n${sys}\n\nUSER:\n${user}`;
    const proc = Bun.spawn({
      cmd: [this.command, prompt],
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    const stdoutText = await new Response(proc.stdout).text();
    if (exitCode !== 0) {
      const stderrText = await new Response(proc.stderr).text();
      throw new Error(`CLI '${this.command}' failed with code ${exitCode}: ${stderrText}`);
    }
    return stdoutText.trim();
  }
}
