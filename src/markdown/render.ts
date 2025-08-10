let cachedRenderer: ((md: string) => string) | null = null;

export async function renderMarkdownToAnsi(markdown: string, _width?: number): Promise<string> {
  if (!markdown) return "";

  if (cachedRenderer) return cachedRenderer(markdown);

  // Dynamically import to keep startup fast and avoid ESM/CJS issues
  const markedMod: any = await import("marked");
  const marked = markedMod.marked ?? markedMod.default ?? markedMod;

  const termMod: any = await import("marked-terminal");
  const TerminalRenderer = termMod.default ?? termMod.MarkedTerminal ?? termMod;

  // Configure marked to use the terminal renderer
  const renderer = new TerminalRenderer({
    reflowText: true,
    // width is often handled by terminal wrapping; options available vary by version
  });
  if (typeof marked.setOptions === "function") {
    marked.setOptions({ renderer });
  }

  cachedRenderer = (md: string) => marked(md);
  return cachedRenderer(markdown);
}
