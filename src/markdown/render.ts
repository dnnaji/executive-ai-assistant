let cachedRenderer: ((md: string) => string) | null = null;
let cachedWidth: number | undefined;

export async function renderMarkdownToAnsi(markdown: string, width?: number): Promise<string> {
  if (!markdown) return "";

  // Disable caching for now to debug
  // if (cachedRenderer && cachedWidth === width) return cachedRenderer(markdown);

  // Dynamically import to keep startup fast and avoid ESM/CJS issues
  const markedMod: any = await import("marked");
  const marked = markedMod.marked ?? markedMod.default ?? markedMod;

  const termMod: any = await import("marked-terminal");
  const TerminalRenderer = termMod.default ?? termMod.MarkedTerminal ?? termMod;

  // Import chalk for formatting
  const chalkMod: any = await import("chalk");
  const chalk = chalkMod.default ?? chalkMod;
  const { Chalk } = chalkMod;
  
  // Force chalk to use colors for terminal output
  const chalkForced = new Chalk({ level: 2 });

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

  // Configure the terminal renderer options - pass chalk instance for v7+ compatibility
  const terminalOptions: any = {
    chalk: chalkForced,
    reflowText: true,
    width: typeof width === "number" ? width : undefined,
    unescape: true,
    emoji: true,
    showSectionPrefix: false,
  };

  // Add highlight function if available
  if (highlightFn) {
    terminalOptions.highlight = highlightFn;
  }

  // Configure marked with the terminal renderer - use setOptions as marked-terminal v7+ requires
  marked.setOptions({ 
    renderer: new TerminalRenderer(terminalOptions),
    breaks: false,
    gfm: true,
  });

  cachedRenderer = (md: string) => marked(md);
  cachedWidth = width;
  return cachedRenderer(markdown);
}
