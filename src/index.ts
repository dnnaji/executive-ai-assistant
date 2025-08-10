import { AgentRunner } from "./agent/core";
import React from "react";
import { render } from "ink";
import App from "./tui/App.js";

async function main() {
  const arg = process.argv.slice(2).join(" ");
  if (!arg) {
    render(React.createElement(App));
    return; // TUI takes over
  }
  const agent = new AgentRunner();
  const answer = await agent.run(arg);
  console.log("\nFinal Answer:\n", answer);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
