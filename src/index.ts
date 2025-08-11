import { ChatAgent } from "./chat/agent";
import React from "react";
import { render } from "ink";
import App from "./tui/App";
import { renderMarkdownToAnsi } from "./markdown/render";

async function main() {
  const arg = process.argv.slice(2).join(" ");
  if (!arg) {
    render(React.createElement(App));
    return; // TUI takes over
  }
  const result = await new ChatAgent().chat(arg);
  await result.match(
    async (answer: string) => {
      const rendered = await renderMarkdownToAnsi(answer, process.stdout.columns ?? 80);
      console.log("\nFinal Answer:\n");
      console.log(rendered);
    },
    (error) => {
      console.error(`Error (${error.kind}): ${error.message}`);
      if (error.kind === 'provider') {
        console.error(`Provider: ${error.provider}`);
      }
      process.exit(1);
    }
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
