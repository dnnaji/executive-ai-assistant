import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';
import chalk from 'chalk';

// Force chalk to use colors
import { Chalk } from 'chalk';
const chalkForced = new Chalk({level: 2});

console.log('Testing forced chalk:');
console.log('Raw ANSI bold:', `\x1b[1mbold text\x1b[22m`);
console.log('Chalk forced bold:', chalkForced.bold('This should be bold'));
console.log('Chalk forced italic:', chalkForced.italic('This should be italic'));

console.log('\nTesting marked-terminal with forced chalk:');
const renderer = new TerminalRenderer({ 
  chalk: chalkForced,
  width: 80,
  reflowText: true
});

marked.setOptions({ renderer });

const markdown = '**bold text** and *italic text*';
const result = marked(markdown);

console.log('Input:', markdown);
console.log('Output with escapes visible:', JSON.stringify(result));
console.log('Rendered output:');
console.log(result);