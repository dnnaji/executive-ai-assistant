import { AgentRunner } from "./agent/core";

async function main() {
  const goal = process.argv.slice(2).join(" ") || "Find the square of 23+19 using the calculator, then summarize.";
  const agent = new AgentRunner();
  const answer = await agent.run(goal);
  console.log("\nFinal Answer:\n", answer);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
