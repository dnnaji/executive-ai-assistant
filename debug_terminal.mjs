import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';

// Simple test
const markdown = '**bold text** and *italic text*';

// Configure marked with terminal renderer
marked.setOptions({
  renderer: new TerminalRenderer()
});

console.log('Direct marked-terminal test:');
console.log('Input:', markdown);
const result = marked(markdown);
console.log('Output:', JSON.stringify(result));
console.log('Rendered:', result);