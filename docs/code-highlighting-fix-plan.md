# Code Highlighting and Dynamic Resizing Fix Plan

## Current Issues

### 1. Code Syntax Highlighting Not Working
- **Problem**: PHP and other code blocks display without syntax colors in the terminal
- **Root Cause**: The Shiki highlighter's `codeToThemedTokens` method returns tokens but the ANSI color conversion isn't properly applying the theme colors
- **Location**: `src/markdown/render.ts:74-96` (shikiAnsi implementation)

### 2. Code Blocks Don't Resize Dynamically
- **Problem**: Code blocks maintain fixed width and don't adapt when terminal window is resized
- **Root Cause**: The boxCode function uses static width calculations passed at render time
- **Location**: `src/markdown/render.ts:296-353` (boxCode function)

### 3. Render Cache Prevents Dynamic Updates
- **Problem**: Cached renders don't update when terminal dimensions change
- **Root Cause**: Cache key includes width but the cache isn't invalidated on resize
- **Location**: `src/markdown/render.ts:145-147` (caching logic)

## Implementation Plan

### Phase 1: Fix Syntax Highlighting

#### 1.1 Update Shiki Token Processing
```typescript
// src/markdown/render.ts:74-96
// Fix the codeToAnsi implementation to properly extract and apply token colors
shikiAnsi = {
  codeToAnsi: (highlighter: any, code: string, opts: any) => {
    const theme = opts?.theme ?? 'github-dark';
    const lang = opts?.lang ?? 'text';
    
    // Get properly themed tokens
    const tokens = highlighter.codeToTokens(code, { 
      lang, 
      theme,
      includeExplanation: false 
    });
    
    // Process tokens with correct color extraction
    const lines = tokens.tokens.map((line: any[]) => {
      return line.map((token: any) => {
        // Extract color from token.color or token.styles
        const color = token.color || 
                     (token.styles && token.styles.color) ||
                     (token.htmlStyle && extractColorFromStyle(token.htmlStyle));
        
        let styler: any = color ? chalk.hex(color) : chalk;
        
        // Apply font styles
        if (token.fontStyle) {
          const style = typeof token.fontStyle === 'number' ? token.fontStyle : 0;
          if (style & 1) styler = styler.italic;
          if (style & 2) styler = styler.bold;  
          if (style & 4) styler = styler.underline;
        }
        
        return styler(token.content || '');
      }).join('');
    });
    
    return lines.join('\n');
  }
};
```

#### 1.2 Add Missing Language Support
```typescript
// src/markdown/render.ts:66-69
// Add more commonly used languages
shikiHighlighter = await createHighlighter({
  themes: ['github-dark', 'github-light'],
  langs: [
    'javascript','typescript','tsx','jsx','json','bash','shell','sh',
    'markdown','md','yaml','yml','python','go','rust','html','css',
    'scss','less','c','cpp','java','kotlin','swift','sql',
    'php','ruby','dockerfile','makefile','xml','toml','ini','diff',
    'plaintext','text'
  ]
});
```

### Phase 2: Implement Dynamic Width Handling

#### 2.1 Update Box Code Function
```typescript
// src/markdown/render.ts:296-353
function boxCode(contentAnsi: string, widthLocal: number, lang: string, ctx: RenderContext): string {
  // Use context width that updates dynamically
  const currentWidth = ctx.width || process.stdout.columns || 80;
  const minBoxWidth = 40; // Increase minimum for readability
  const boxWidth = Math.max(minBoxWidth, Math.min(currentWidth, widthLocal));
  
  // Calculate inner width with proper padding
  const innerWidth = Math.max(20, boxWidth - 4);
  
  // ... rest of implementation with dynamic width calculations
}
```

#### 2.2 Add Terminal Resize Listener in TUI
```typescript
// src/tui/App.tsx
import { useStdout } from 'ink';

export default function App() {
  const { stdout } = useStdout();
  const [termWidth, setTermWidth] = useState(stdout.columns || 80);
  
  useEffect(() => {
    const handleResize = () => {
      setTermWidth(stdout.columns || 80);
    };
    
    process.stdout.on('resize', handleResize);
    return () => {
      process.stdout.off('resize', handleResize);
    };
  }, []);
  
  // Pass dynamic width to renderer
  const rendered = await renderMarkdownToAnsi(answer, termWidth - 4);
}
```

### Phase 3: Optimize Caching Strategy

#### 3.1 Implement Width-Aware Cache
```typescript
// src/markdown/render.ts:145-147
// Add width buckets to prevent excessive cache misses
function getWidthBucket(width: number): number {
  // Round to nearest 10 columns to reduce cache fragmentation
  return Math.round(width / 10) * 10;
}

const cacheKey = `${astKey}:${getWidthBucket(width)}:${theme}:${interactive}`;
```

#### 3.2 Add Cache Invalidation
```typescript
// Add cache management functions
export function clearRenderCache(): void {
  renderCache.clear();
}

export function invalidateCacheForWidth(width: number): void {
  const bucket = getWidthBucket(width);
  for (const [key] of renderCache) {
    if (key.includes(`:${bucket}:`)) {
      renderCache.delete(key);
    }
  }
}
```

### Phase 4: Testing and Validation

#### 4.1 Test Cases
1. **Syntax Highlighting**
   - Test PHP code blocks with proper syntax colors
   - Test JavaScript/TypeScript with modern syntax
   - Test edge cases (empty code, very long lines)

2. **Dynamic Resizing**
   - Test terminal resize during active session
   - Test code blocks at minimum width (40 chars)
   - Test code blocks at maximum width (200+ chars)

3. **Performance**
   - Measure render time with/without cache
   - Test memory usage with large markdown documents
   - Verify cache hit rates

#### 4.2 Visual Testing
```bash
# Test command for different terminal widths
for width in 40 80 120 160; do
  printf '\033[8;24;'$width't'
  bun run dev
  # Test with sample markdown containing code blocks
done
```

## Expected Outcomes

1. **Proper Syntax Highlighting**: Code blocks will display with appropriate colors for keywords, strings, comments, etc.
2. **Responsive Layout**: Code blocks will automatically adjust to terminal width changes
3. **Improved Performance**: Smart caching will maintain fast render times while supporting dynamic layouts
4. **Better Language Support**: Support for 25+ programming languages including PHP, Ruby, Docker, etc.

## Implementation Priority

1. **High Priority**: Fix syntax highlighting (Phase 1) - Core functionality issue
2. **High Priority**: Dynamic width handling (Phase 2) - User experience issue  
3. **Medium Priority**: Cache optimization (Phase 3) - Performance enhancement
4. **Low Priority**: Extended testing (Phase 4) - Quality assurance

## Timeline Estimate

- Phase 1: 1-2 hours
- Phase 2: 1-2 hours  
- Phase 3: 30 minutes
- Phase 4: 1 hour

Total: ~4-5 hours of implementation and testing