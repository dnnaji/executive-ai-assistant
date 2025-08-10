import { renderMarkdownToAnsi } from "./src/markdown/render.ts";

const testMarkdown = `Here is some **bold text** and *italic text* and normal text.

Also testing \`inline code\` and regular text.`;

console.log("Testing bold/italic rendering...");
try {
  const result = await renderMarkdownToAnsi(testMarkdown, 80);
  console.log("Raw output:");
  console.log(JSON.stringify(result));
  console.log("\nRendered output:");
  console.log(result);
} catch (error) {
  console.error("Error:", error);
}