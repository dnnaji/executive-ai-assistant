let cachedRenderer: ((md: string) => string) | null = null;
let cachedWidth: number | undefined;

export async function renderMarkdownToAnsi(markdown: string, width?: number): Promise<string> {
  if (!markdown) return "";

  if (cachedRenderer && cachedWidth === width) return cachedRenderer(markdown);

  // Dynamically import to keep startup fast and avoid ESM/CJS issues
  const markedMod: any = await import("marked");
  const marked = markedMod.marked ?? markedMod.default ?? markedMod;

  const termMod: any = await import("marked-terminal");
  const TerminalRenderer = termMod.default ?? termMod.MarkedTerminal ?? termMod;

  // Set up syntax highlighting first
  let highlightFn: ((code: string, lang?: string) => string) | undefined;
  try {
    const cliHighlightMod: any = await import("cli-highlight");
    const highlight = cliHighlightMod.highlight ?? cliHighlightMod.default ?? cliHighlightMod;
    highlightFn = (code: string, lang?: string) => {
      try {
        return highlight(code, { 
          language: lang || undefined, 
          ignoreIllegals: true,
          theme: 'default'
        });
      } catch {
        return code;
      }
    };
  } catch {
    // highlighting optional
  }

  // Configure the terminal renderer with syntax highlighting support
  const renderer = new TerminalRenderer({
    reflowText: true,
    width: typeof width === "number" ? width : undefined,
    code: highlightFn ? (code: string, lang?: string) => highlightFn!(code, lang) : undefined,
    blockquote: (text: string) => `┃ ${text.replace(/\n/g, '\n┃ ')}`,
    html: (html: string) => html,
    heading: (text: string, level: number) => {
      const colors = ['magenta', 'cyan', 'yellow', 'green', 'blue', 'red'];
      const color = colors[Math.min(level - 1, colors.length - 1)];
      return `\x1b[1;${color === 'magenta' ? '35' : color === 'cyan' ? '36' : color === 'yellow' ? '33' : color === 'green' ? '32' : color === 'blue' ? '34' : '31'}m${text}\x1b[0m`;
    },
    hr: () => '─'.repeat(width || 80),
    list: (body: string, ordered: boolean) => body,
    listitem: (text: string) => `  • ${text}`,
    paragraph: (text: string) => `${text}\n`,
    strong: (text: string) => `\x1b[1m${text}\x1b[0m`,
    em: (text: string) => `\x1b[3m${text}\x1b[0m`,
    codespan: (text: string) => `\x1b[100m${text}\x1b[0m`,
    del: (text: string) => `\x1b[9m${text}\x1b[0m`,
    link: (href: string, title: string, text: string) => `\x1b[34m${text}\x1b[0m (\x1b[90m${href}\x1b[0m)`,
  });

  // Configure marked with the terminal renderer
  if (typeof (marked as any).use === "function") {
    (marked as any).use({ renderer });
  } else if (typeof marked.setOptions === "function") {
    marked.setOptions({ renderer });
  }

  cachedRenderer = (md: string) => marked(md);
  cachedWidth = width;
  return cachedRenderer(markdown);
}
