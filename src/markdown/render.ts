// Experimental remark/shiki renderer with graceful fallback to marked-terminal.

let cachedWidth: number | undefined;
let cachedChalk: any | null = null;

// New renderer state
let initialized = false;
let parserProcessor: any | null = null; // unified processor
let shikiHighlighter: any | null = null;
let shikiAnsi: any | null = null; // ANSI renderer utilities

// Simple content-based caches
const MAX_AST_CACHE = 100;
const MAX_RENDER_CACHE = 50;
const astCache: Map<string, any> = new Map();
const renderCache: Map<string, string> = new Map();

function lruGet<K, V>(map: Map<K, V>, key: K): V | undefined {
  const val = map.get(key);
  if (val !== undefined) {
    // refresh recency
    map.delete(key);
    map.set(key, val);
  }
  return val;
}

function lruSet<K, V>(map: Map<K, V>, key: K, value: V, max: number) {
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  if (map.size > max) {
    const firstKey = map.keys().next().value as K;
    map.delete(firstKey);
  }
}

async function ensureChalk(): Promise<any> {
  if (cachedChalk) return cachedChalk;
  const chalkMod: any = await import("chalk");
  const chalkAny = chalkMod.default ?? chalkMod;
  const forced = chalkMod?.Chalk
    ? new chalkMod.Chalk({ level: 2 })
    : (chalkAny?.Instance ? new chalkAny.Instance({ level: 2 }) : (() => { try { chalkAny.level = 2; } catch {} return chalkAny; })());
  cachedChalk = forced;
  return forced;
}

async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  try {
    // unified + remark parser
    const unifiedMod: any = await import("unified");
    const remarkParseMod: any = await import("remark-parse");
    const remarkGfmMod: any = await import("remark-gfm");
    const unified = unifiedMod.unified ?? unifiedMod.default ?? unifiedMod;
    const remarkParse = remarkParseMod.default ?? remarkParseMod;
    const remarkGfm = remarkGfmMod.default ?? remarkGfmMod;
    parserProcessor = unified().use(remarkParse).use(remarkGfm);

    // shiki highlighter and ANSI renderer
    const shikiMod: any = await import("shiki");
    // Prefer createHighlighter in v1, fallback to getHighlighter
    const createHighlighter = shikiMod.createHighlighter ?? shikiMod.getHighlighter ?? shikiMod.default ?? shikiMod;
    shikiHighlighter = await createHighlighter({
      themes: ['github-dark'],
      langs: [
        'javascript','typescript','tsx','jsx','json','bash','shell','sh',
        'markdown','md','yaml','yml','python','go','rust','html','css',
        'scss','less','c','cpp','java','kotlin','swift','sql',
        'php','ruby','dockerfile','makefile','xml','toml','ini','diff',
        'plaintext','text'
      ]
    });

    // ANSI renderer: implement codeToAnsi using shiki tokens with color + font styles
    // because @shikijs/renderer-ansi isn't available in this environment.
    const chalk = await ensureChalk();
    shikiAnsi = {
      codeToAnsi: (highlighter: any, code: string, opts: any) => {
        const theme = opts?.theme ?? 'github-dark';
        const lang = opts?.lang ?? 'text';

        // Helper to extract hex color from inline html style if provided
        const extractColorFromStyle = (style: string | undefined): string | undefined => {
          if (!style) return undefined;
          const match = /color:\s*(#[0-9a-fA-F]{3,8})/i.exec(style);
          return match ? match[1] : undefined;
        };

        // Obtain tokens from shiki across versions
        let tokenLines: any[] = [];
        try {
          if (typeof highlighter.codeToTokens === 'function') {
            const tokenResult = highlighter.codeToTokens(code, { lang, theme, includeExplanation: false });
            tokenLines = (tokenResult?.tokens ?? tokenResult) as any[];
          } else {
            tokenLines = highlighter.codeToThemedTokens(code, { lang, theme });
          }
        } catch {
          // Fallback to plain text if the language is not supported
          return code;
        }

        const lines = tokenLines.map((line: any[]) => line.map((token: any) => {
          const color = token?.color
            || token?.styles?.color
            || extractColorFromStyle(token?.htmlStyle);

          let styler: any = color ? chalk.hex(color) : chalk;

          // fontStyle bitmask: Italic 1, Bold 2, Underline 4
          const style = typeof token?.fontStyle === 'number' ? token.fontStyle : 0;
          if (style & 1) styler = styler.italic;
          if (style & 2) styler = styler.bold;
          if (style & 4) styler = styler.underline;

          return styler(String(token?.content ?? ''));
        }).join(''));

        return lines.join('\n');
      }
    };

    initialized = true;
  } catch (error) {
    // If initialization fails, mark as not initialized so we can retry later
    initialized = false;
    throw error;
  }
}

function hashKey(str: string): string {
  // Lightweight djb2 hash to avoid Node crypto/require in ESM
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash |= 0; // force 32-bit
  }
  // Convert to unsigned hex
  return (hash >>> 0).toString(16);
}

type RenderContext = {
  width: number;
  indentLevel: number;
  theme: any;
  interactive: boolean;
};

async function renderWithRemarkShiki(markdown: string, width: number): Promise<string> {
  await ensureInitialized();
  const chalk = await ensureChalk();
  const wrapAnsiMod: any = await import("wrap-ansi");
  const wrapAnsi = wrapAnsiMod.default ?? wrapAnsiMod;
  const stringWidthMod: any = await import('string-width');
  const stringWidth = stringWidthMod.default ?? stringWidthMod;
  const stripAnsiMod: any = await import('strip-ansi');
  const stripAnsi = stripAnsiMod.default ?? stripAnsiMod;
  const sliceAnsiMod: any = await import('slice-ansi');
  const sliceAnsi = sliceAnsiMod.default ?? sliceAnsiMod;

  // AST cache
  const astKey = hashKey(markdown);
  let ast = lruGet(astCache, astKey);
  if (!ast) {
    ast = parserProcessor.parse(markdown);
    lruSet(astCache, astKey, ast, MAX_AST_CACHE);
  }

  const cacheKey = `${astKey}:${getWidthBucket(width)}:github-dark:false`;
  const cached = lruGet(renderCache, cacheKey);
  if (cached) return cached;

  const context: RenderContext = {
    width,
    indentLevel: 0,
    theme: {
      text: (s: string) => s,
      strong: (s: string) => chalk.bold(s),
      emphasis: (s: string) => chalk.italic(s),
      code: (s: string) => chalk.yellow(s),
      heading1: (s: string) => chalk.cyan.bold(s),
      heading2: (s: string) => chalk.blue.bold(s),
      heading3: (s: string) => chalk.green.bold(s),
      heading4: (s: string) => chalk.yellow.bold(s),
      link: (s: string) => chalk.blue.underline(s),
      linkUrl: (s: string) => chalk.blue(s),
      underline: (s: string) => chalk.underline(s),
      blockquote: (s: string) => chalk.gray.italic(s),
      listBullet: (s: string) => chalk.cyan(s),
    },
    interactive: false,
  };

  function renderInline(node: any, ctx: RenderContext): string {
    switch (node.type) {
      case 'text':
        return node.value ?? '';
      case 'strong':
        return ctx.theme.strong(renderInlines(node.children ?? [], ctx));
      case 'emphasis':
        return ctx.theme.emphasis(renderInlines(node.children ?? [], ctx));
      case 'inlineCode':
        return ctx.theme.code(node.value ?? '');
      case 'delete':
        return (ctx.theme.del ?? ((s: string) => s))(renderInlines(node.children ?? [], ctx));
      case 'link': {
        const text = renderInlines(node.children ?? [], ctx);
        const url = node.url ?? '';
        return `${ctx.theme.link(text)} ${ctx.theme.linkUrl(`(${url})`)}`;
      }
      default:
        return node.children ? renderInlines(node.children, ctx) : '';
    }
  }

  function renderInlines(children: any[], ctx: RenderContext): string {
    return children.map((child) => renderInline(child, ctx)).join('');
  }

  function wrapParagraph(text: string, ctx: RenderContext): string {
    const availableWidth = Math.max(20, ctx.width - ctx.indentLevel);
    const wrapped = wrapAnsi(text, availableWidth, { 
      hard: false, 
      trim: false, 
      wordWrap: true 
    });
    
    // Apply indentation if needed
    if (ctx.indentLevel > 0) {
      const indent = ' '.repeat(ctx.indentLevel);
      return wrapped.split('\n').map((line: string) => indent + line).join('\n');
    }
    
    return wrapped;
  }

  function renderBlock(node: any, ctx: RenderContext): string {
    switch (node.type) {
      case 'heading': {
        const content = renderInlines(node.children ?? [], ctx);
        if (node.depth === 1) return ctx.theme.heading1(content);
        if (node.depth === 2) return ctx.theme.heading2(content);
        if (node.depth === 3) return ctx.theme.heading3(content);
        return ctx.theme.heading4(`${'#'.repeat(Math.max(1, Math.min(6, node.depth)))} ${content}`);
      }
      case 'paragraph': {
        const content = renderInlines(node.children ?? [], ctx);
        return wrapParagraph(content, ctx);
      }
      case 'blockquote': {
        const inner = (node.children ?? []).map((c: any) => renderBlock(c, { ...ctx, indentLevel: ctx.indentLevel + 2 })).join('\n');
        const prefixed = inner.split('\n').map((line: string) => `> ${line}`).join('\n');
        return ctx.theme.blockquote(prefixed);
      }
      case 'list': {
        const isOrdered = !!node.ordered;
        const start = typeof node.start === 'number' ? node.start : 1;
        const items = (node.children ?? []) as any[];
        const indent = ' '.repeat(ctx.indentLevel);
        
        return items.map((item, idx) => {
          const marker = isOrdered ? `${start + idx}.` : '•';
          const markerStyled = isOrdered ? marker : ctx.theme.listBullet(marker);
          
          // Render item content
          const itemText = (item.children ?? []).map((c: any) => {
            if (c.type === 'paragraph') {
              return renderInlines(c.children ?? [], ctx);
            } else {
              return renderBlock(c, { ...ctx, indentLevel: ctx.indentLevel + 2 });
            }
          }).join('\n');
          
          // Calculate available width for content
          const markerWidth = stringWidth(stripAnsi(markerStyled)) + 1; // +1 for space
          const availableWidth = Math.max(20, ctx.width - ctx.indentLevel - markerWidth);
          
          // Wrap the content
          const wrapped = wrapAnsi(itemText, availableWidth, { 
            hard: false, 
            trim: false, 
            wordWrap: true 
          });
          
          // Format with hanging indent
          const lines = wrapped.split('\n');
          const firstLine = `${indent}${markerStyled} ${lines[0] || ''}`;
          const hangingIndent = ' '.repeat(ctx.indentLevel + markerWidth);
          const remainingLines = lines.slice(1).map((line: string) => `${hangingIndent}${line}`);
          
          return [firstLine, ...remainingLines].join('\n');
        }).join('\n');
      }
      case 'code': {
        const lang = node.lang ?? 'text';
        try {
          if (shikiHighlighter && shikiAnsi?.codeToAnsi) {
            const ansi = awaitMaybeSyncAnsi(node.value ?? '', lang);
            return boxCode(ansi, ctx.width, lang, ctx);
          }
        } catch {
          // fallthrough
        }
        // Fallback: simple styling without highlighting
        // Avoid await in non-async function; use cached chalk if present
        const chalkForced = cachedChalk ?? { yellow: (s: string) => s };
        return boxCode(chalkForced.yellow ? chalkForced.yellow(node.value ?? '') : (node.value ?? ''), ctx.width, lang, ctx);
      }
      case 'thematicBreak':
        return '─'.repeat(Math.max(0, ctx.width - ctx.indentLevel));
      default: {
        if (Array.isArray(node.children)) {
          return node.children.map((c: any) => renderBlock(c, ctx)).join('\n');
        }
        return '';
      }
    }
  }

  function boxCode(contentAnsi: string, widthLocal: number, lang: string, ctx: RenderContext): string {
    // Derive a responsive width each render
    const currentWidth = ctx.width || (typeof process !== 'undefined' && process.stdout ? process.stdout.columns : undefined) || 80;
    const minBoxWidth = 40;
    const boxWidth = Math.max(minBoxWidth, Math.min(currentWidth, widthLocal));
    
    // Inner content width (subtract 4 for borders and padding: │ content │)
    const innerWidth = Math.max(1, boxWidth - 4);
    
    // Create label
    const labelRaw = lang && lang !== 'text' ? ` ${lang} ` : '';
    const chalkTheme = ctx.theme;
    const labelStyled = labelRaw ? (chalkTheme.code ? chalkTheme.code(labelRaw) : labelRaw) : '';
    
    // Calculate border width (subtract 2 for corner characters ┌ ┐)
    const borderWidth = boxWidth - 2;
    
    // Create top border with label
    let topBorder: string;
    if (labelStyled) {
      const labelDisplayWidth = stringWidth(stripAnsi(labelStyled));
      const remainingDashes = Math.max(0, borderWidth - labelDisplayWidth);
      topBorder = '┌' + labelStyled + '─'.repeat(remainingDashes) + '┐';
    } else {
      topBorder = '┌' + '─'.repeat(borderWidth) + '┐';
    }
    
    // Create bottom border
    const bottomBorder = '└' + '─'.repeat(borderWidth) + '┘';

    // Process content lines
    const lines = contentAnsi.split('\n');
    const contentLines = lines.map((line: string) => {
      // Wrap line to inner width
      const wrapped = wrapAnsi(line, innerWidth, { 
        hard: true, 
        trim: false, 
        wordWrap: true 
      });
      
      return wrapped.split('\n').map((wrappedLine: string) => {
        const visible = stripAnsi(wrappedLine);
        const displayWidth = stringWidth(visible);
        
        // Truncate if still too long
        const truncated = displayWidth > innerWidth 
          ? sliceAnsi(wrappedLine, 0, innerWidth) 
          : wrappedLine;
        
        // Add padding to fill the inner width
        const finalVisible = stripAnsi(truncated);
        const finalWidth = stringWidth(finalVisible);
        const padding = Math.max(0, innerWidth - finalWidth);
        
        return `│ ${truncated}${' '.repeat(padding)} │`;
      }).join('\n');
    }).join('\n');

    return [topBorder, contentLines, bottomBorder].join('\n');
  }

  function renderRoot(root: any, ctx: RenderContext): string {
    return (root.children ?? []).map((n: any) => renderBlock(n, ctx)).filter(Boolean).join('\n\n');
  }

  // Helper to bridge potential async/ sync ANSI renderer API variations
  function awaitMaybeSyncAnsi(code: string, language: string): string {
    try {
      // Attempt v1 codeToAnsi(highlighter, code, options)
      if (typeof shikiAnsi.codeToAnsi === 'function') {
        // Some versions curry highlighter, others expect it as first arg
        if (shikiAnsi.codeToAnsi.length >= 2) {
          return shikiAnsi.codeToAnsi(shikiHighlighter, code, { lang: language, theme: 'github-dark' });
        }
        return shikiAnsi.codeToAnsi(code, { lang: language, theme: 'github-dark', highlighter: shikiHighlighter });
      }
    } catch {}
    return code;
  }

  const rendered = renderRoot(ast, context);
  lruSet(renderCache, cacheKey, rendered, MAX_RENDER_CACHE);
  return rendered;
}

async function renderWithMarked(markdown: string, width?: number): Promise<string> {
  // Legacy fallback using marked-terminal
  const markedMod: any = await import("marked");
  const marked = markedMod.marked ?? markedMod.default ?? markedMod;
  const termMod: any = await import("marked-terminal");
  const { markedTerminal } = termMod;
  const chalk = await ensureChalk();

  let highlightFn: ((code: string, lang?: string) => string) | undefined;
  try {
    const cliHighlightMod: any = await import("cli-highlight");
    const highlight = cliHighlightMod.highlight ?? cliHighlightMod.default ?? cliHighlightMod;
    highlightFn = (code: string, lang?: string) => {
      try {
        return highlight(code, { language: lang || undefined, ignoreIllegals: true, theme: 'default' });
      } catch { return code; }
    };
  } catch {
    // optional
  }

  const terminalOptions: any = {
    reflowText: true,
    width: typeof width === "number" ? width : undefined,
    unescape: true,
    emoji: true,
    showSectionPrefix: false,
    strong: (text: string) => chalk.bold(text),
    em: (text: string) => chalk.italic(text),
    codespan: (text: string) => chalk.yellow(text),
    del: (text: string) => chalk.strikethrough(text),
    link: (text: string) => chalk.blue(text),
    heading: (text: string) => chalk.green.bold(text),
  };
  if (highlightFn) terminalOptions.highlight = highlightFn;
  marked.use(markedTerminal(terminalOptions));
  marked.setOptions({ breaks: false, gfm: true });
  return marked(markdown);
}

export async function renderMarkdownToAnsi(markdown: string, width?: number): Promise<string> {
  if (!markdown) return "";
  const targetWidth = typeof width === 'number' ? width : (process.stdout.columns ?? 80);

  // Try new pipeline first
  try {
    const rendered = await renderWithRemarkShiki(markdown, targetWidth);
    cachedWidth = targetWidth;
    return rendered;
  } catch {
    // Fallback to legacy renderer
    const rendered = await renderWithMarked(markdown, targetWidth);
    cachedWidth = targetWidth;
    return rendered;
  }
}

// Cache management utilities
function getWidthBucket(width: number): number {
  return Math.round(width / 10) * 10;
}

export function clearRenderCache(): void {
  renderCache.clear();
}

export function invalidateCacheForWidth(width: number): void {
  const bucket = getWidthBucket(width);
  for (const key of Array.from(renderCache.keys())) {
    if (key.includes(`:${bucket}:`)) {
      renderCache.delete(key);
    }
  }
}
