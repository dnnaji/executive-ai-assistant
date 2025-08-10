let cachedRenderer: ((md: string) => string) | null = null;
let cachedWidth: number | undefined;

export async function renderMarkdownToAnsi(markdown: string, width?: number): Promise<string> {
  if (!markdown) return "";

  if (cachedRenderer && cachedWidth === width) return cachedRenderer(markdown);

  // Dynamically import to keep startup fast and avoid ESM/CJS issues
  const markedMod: any = await import("marked");
  const marked = markedMod.marked ?? markedMod.default ?? markedMod;

  const termMod: any = await import("marked-terminal");
  const { markedTerminal } = termMod;

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

  // Configure the terminal renderer options with custom styling functions
  const terminalOptions: any = {
    reflowText: true,
    width: typeof width === "number" ? width : undefined,
    unescape: true,
    emoji: true,
    showSectionPrefix: false,
    // Override default styling with our forced chalk instance
    strong: (text: string) => chalkForced.bold(text),
    em: (text: string) => chalkForced.italic(text),
    codespan: (text: string) => chalkForced.yellow(text),
    del: (text: string) => chalkForced.strikethrough(text),
    link: (text: string) => chalkForced.blue(text),
    heading: (text: string) => chalkForced.green.bold(text),
  };

  // Add highlight function if available
  if (highlightFn) {
    terminalOptions.highlight = highlightFn;
  }

  // Use marked-terminal extension with modern API
  marked.use(markedTerminal(terminalOptions));
  
  // Configure marked options
  marked.setOptions({
    breaks: false,
    gfm: true,
  });

  cachedRenderer = (md: string) => marked(md);
  cachedWidth = width;
  return cachedRenderer(markdown);
}
