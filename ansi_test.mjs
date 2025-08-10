// Direct ANSI test
console.log('Direct ANSI codes:');
console.log('\x1b[1mThis should be bold\x1b[22m');
console.log('\x1b[3mThis should be italic\x1b[23m');
console.log('\x1b[33mThis should be yellow\x1b[39m');

// Test our markdown renderer
import { renderMarkdownToAnsi } from "./src/markdown/render.ts";

const testMd = 'Testing **bold** and *italic* text.';
console.log('\nOur renderer:');
const result = await renderMarkdownToAnsi(testMd, 80);
console.log('Result with visible escapes:', JSON.stringify(result));
console.log('Rendered result:');
console.log(result);