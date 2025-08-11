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
  const answer = await new ChatAgent().chat(arg);
  const rendered = await renderMarkdownToAnsi(answer, process.stdout.columns ?? 80);
  console.log("\nFinal Answer:\n");
  console.log(rendered);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
