import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';
import chalk from 'chalk';

console.log('Testing chalk directly:');
console.log(chalk.bold('This should be bold'));
console.log(chalk.italic('This should be italic'));

console.log('\nTesting marked-terminal with chalk:');
const renderer = new TerminalRenderer({ chalk });

marked.setOptions({ renderer });

const markdown = '**bold text** and *italic text*';
const result = marked(markdown);

console.log('Input:', markdown);
console.log('Output JSON:', JSON.stringify(result));
console.log('Rendered output:');
console.log(result);