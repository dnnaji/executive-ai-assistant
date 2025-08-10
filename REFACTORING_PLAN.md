# Executive AI Assistant Refactoring Plan

## Overview
Transform the current complex executive assistant system into a simple, clean chat agent using Vercel AI SDK v5 with fallback to local `ai` command.

## Phase 1: Critical Bug Fixes

### 1.1 Import Path Issues
- **Files**: `src/index.ts:4,5`
- **Issue**: Using `.js` extension for TypeScript imports
- **Fix**:
  - Change `import App from "./tui/App.js";` to `import App from "./tui/App";`
  - Change `import { renderMarkdownToAnsi } from "./markdown/render.js";` to `import { renderMarkdownToAnsi } from "./markdown/render";`

### 1.2 Path Alias Configuration
- **Files**: `src/tui/App.tsx:3,5`
- **Issue**: Using `@/` alias without proper tsconfig setup and runtime resolver
- **Fix**:
  - Prefer switching to relative imports (works with Bun without bundling):
    - `import { renderMarkdownToAnsi } from "../markdown/render";`
    - `import { AgentRunner } from "../agent/core";`
  - If keeping aliases, add to `tsconfig.json` AND ensure a bundler/runtime that respects `paths` (Bun may not resolve them at runtime).

### 1.3 Security Vulnerability
- **File**: `src/agent/tools.ts:77`
- **Issue**: Unsafe `Function()` constructor for expression evaluation
- **Fix**: Replace with safe math parser
  ```typescript
  // Remove current calculator tool
  // Add safe math evaluation using mathjs or similar
  import { evaluate } from 'mathjs';
  
  execute: async (args) => {
    const { expression } = CalculatorArgs.parse(args);
    try {
      const result = evaluate(expression);
      return { summary: `evaluated ${expression}`, result };
    } catch (e) {
      return { summary: `error evaluating ${expression}`, result: String(e) };
    }
  }
  ```

### 1.4 TypeScript Configuration
- **Create**: `tsconfig.json` with strict mode
  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "module": "ESNext",
      "moduleResolution": "bundler",
      "allowSyntheticDefaultImports": true,
      "esModuleInterop": true,
      "allowJs": true,
      "strict": true,
      "skipLibCheck": true,
      "jsx": "react-jsx",
      "baseUrl": ".",
      "types": ["bun-types"],
      "paths": {
        "@/*": ["src/*"]
      }
    },
    "include": ["src/**/*"],
    "exclude": ["node_modules", "dist", "eaia", "scripts"]
  }
  ```

## Phase 2: Remove Python Codebase

### 2.1 Python Files to Remove
```bash
# Remove entire Python ecosystem
rm -rf eaia/
rm -rf scripts/
rm -f requirements.txt
rm -f pyproject.toml
rm -f .python-version
```

**Files identified for removal:**
- `eaia/__init__.py`
- `eaia/gmail.py` 
- `eaia/schemas.py`
- `eaia/cron_graph.py`
- `eaia/reflection_graphs.py`
- `eaia/main/config.py`
- `eaia/main/graph.py`
- `eaia/main/human_inbox.py`
- `eaia/main/__init__.py`
- `eaia/main/find_meeting_time.py`
- `eaia/main/triage.py`
- `eaia/main/draft_response.py`
- `eaia/main/fewshot.py`
- `eaia/main/rewrite.py`
- `eaia/main/config.yaml`
- `scripts/run_single.py`
- `scripts/setup_gmail.py`
- `scripts/run_ingest.py`
- `scripts/setup_cron.py`

### 2.2 Update Documentation
- Remove Python-related sections from README
- Update installation instructions to focus on TypeScript/Bun

## Phase 3: Simplify to Basic Chat Agent

### 3.1 Remove Complex Features
- Remove web search tool (keep as stub or remove entirely)
- Remove complex tool orchestration
- Simplify agent to basic chat with optional calculator
- Remove memory persistence complexity
- Remove TUI complexity (optional - could keep for local use)

Notes:
- If removing tool orchestration entirely, also remove `zod-to-json-schema` and related tool-schema plumbing to reduce dependencies.

### 3.2 Streamline Architecture
```
src/
├── index.ts              # Entry point
├── chat/
│   ├── agent.ts         # Simple chat agent
│   └── types.ts         # Basic types
├── providers/
│   ├── vercel.ts        # Vercel AI SDK provider
│   └── cli.ts           # Fallback CLI provider
├── tools/               # Optional tools
│   └── calculator.ts    # Safe calculator only
└── tui/                 # Optional TUI
    └── App.tsx
```

Incremental migration:
- Keep `AgentRunner` and existing tool flow until `ChatAgent` is ready.
- After validation, remove `src/agent/*` modules and the tool orchestration.

## Phase 4: Vercel AI SDK Integration

### 4.1 Install Dependencies
```bash
bun add ai @ai-sdk/openai @ai-sdk/anthropic
bun remove openai  # Replace with AI SDK
bun add marked marked-terminal  # Align with current markdown renderer
bun remove ink-markdown terminal-markdown  # No longer needed
```

### 4.2 Create Provider Abstraction
```typescript
// src/providers/types.ts
export interface ChatProvider {
  chat(messages: ChatMessage[]): Promise<string>;
}

// src/providers/vercel.ts
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';

export class VercelProvider implements ChatProvider {
  async chat(messages: ChatMessage[]): Promise<string> {
    try {
      const result = await streamText({
        model: openai('gpt-4o-mini'),
        messages: messages.map(m => ({ role: m.role as any, content: m.content })),
      });
      return await result.text();
    } catch (error) {
      throw new Error(`Vercel AI SDK error: ${error}`);
    }
  }
}

// src/providers/cli.ts  
export class CliProvider implements ChatProvider {
  // Keep existing CliLLM logic as fallback
}
```

### 4.3 Update Agent Core
```typescript
// src/chat/agent.ts
import type { ChatMessage } from './types';
import { VercelProvider } from '../providers/vercel';
import { CliProvider } from '../providers/cli';

export class ChatAgent {
  private provider: ChatProvider;

  constructor() {
    // Prefer Vercel AI SDK if API key is present, else fallback to CLI
    this.provider = process.env.OPENAI_API_KEY ? new VercelProvider() : new CliProvider();
  }

  async chat(message: string, history: ChatMessage[] = []): Promise<string> {
    const messages = [
      { role: 'system', content: 'You are a helpful assistant.' },
      ...history,
      { role: 'user', content: message }
    ];
    
    return await this.provider.chat(messages);
  }
}
```

### 4.4 Simplify Entry Point
```typescript
// src/index.ts
import { ChatAgent } from './chat/agent';
import React from 'react';
import { render } from 'ink';
import App from './tui/App';

async function main() {
  const arg = process.argv.slice(2).join(' ');
  
  if (!arg) {
    // Start TUI mode
    render(React.createElement(App));
    return;
  }
  
  // Direct chat mode
  const agent = new ChatAgent();
  const response = await agent.chat(arg);
  console.log(response);
}

main().catch(console.error);
```

### 4.5 Preflight and Fallbacks
- If neither `OPENAI_API_KEY` is set nor the `ai` CLI is available, print a clear error and exit non-zero.
- Prefer `OPENAI_API_KEY` presence to select Vercel AI SDK; otherwise use CLI provider.

## Phase 5: Error Handling & Validation

### 5.1 Input Validation
```typescript
import { z } from 'zod';

const ChatInputSchema = z.object({
  message: z.string().min(1).max(4000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string()
  })).optional()
});
```

### 5.2 Error Boundaries
```typescript
// src/tui/ErrorBoundary.tsx
import React from 'react';
import { Text } from 'ink';

export class ErrorBoundary extends React.Component {
  // Standard React error boundary implementation
}
```

### 5.3 Logging
```typescript
// src/utils/logger.ts
export const logger = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  error: (msg: string, err?: Error) => console.error(`[ERROR] ${msg}`, err),
  debug: (msg: string) => process.env.DEBUG && console.log(`[DEBUG] ${msg}`)
};
```

### 5.4 Security Hardening
- Replace calculator `Function()` with `mathjs` or `expr-eval` and add tests for malicious inputs (e.g., `process.exit()`).

## Phase 6: Package.json Updates

### 6.1 Updated Dependencies
```json
{
  "dependencies": {
    "@ai-sdk/anthropic": "^1.0.0",
    "@ai-sdk/openai": "^1.0.0",
    "@types/react": "^19.1.9",
    "ai": "^4.0.0",
    "ink": "^6.1.0",
    "ink-text-input": "^6.0.0",
    "marked": "^16.1.2",
    "marked-terminal": "^7.3.0",
    "mathjs": "^13.0.0",
    "react": "^19.1.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.7.5",
    "bun-types": "^1.2.20",
    "typescript": "^5.6.3"
  }
}
```

Cleanup after migration:
- Remove `openai`, `zod-to-json-schema`, and any unused tool orchestration modules once simplified chat is fully adopted.

### 6.2 Updated Scripts
```json
{
  "scripts": {
    "start": "bun src/index.ts",
    "dev": "bun --hot src/index.ts",
    "build": "bun build src/index.ts --outdir dist",
    "check": "bun x tsc --noEmit",
    "lint": "bun x eslint src/",
    "test": "bun test"
  }
}
```

### 6.3 .gitignore Hygiene
- Ensure `node_modules/`, `dist/`, and Python artifacts are ignored.

## Phase 7: Testing Strategy

### 7.1 Unit Tests
```typescript
// src/chat/agent.test.ts
import { test, expect } from 'bun:test';
import { ChatAgent } from './agent';

test('basic chat functionality', async () => {
  const agent = new ChatAgent();
  const response = await agent.chat('Hello');
  expect(typeof response).toBe('string');
  expect(response.length).toBeGreaterThan(0);
});
```

Additional tests:
- Calculator rejects unsafe expressions and computes basic arithmetic.
- Markdown renderer returns non-empty ANSI for sample Markdown.
- CLI fallback works when `OPENAI_API_KEY` is not set and `ai` CLI is available.

### 7.2 Integration Tests
- Test Vercel AI SDK integration
- Test CLI fallback behavior
- Test TUI interactions

## Phase 8: Documentation

### 8.1 Update README.md
- Remove Python setup instructions
- Add TypeScript/Bun setup
- Document Vercel AI SDK configuration
- Add usage examples

### 8.2 Add API Documentation
- Document chat agent interface
- Provider abstraction docs
- Configuration options

## Implementation Timeline

1. **Week 1**: Fix critical bugs (Phase 1)
2. **Week 1**: Remove Python code (Phase 2)  
3. **Week 2**: Simplify architecture (Phase 3)
4. **Week 2**: Integrate Vercel AI SDK (Phase 4)
5. **Week 3**: Error handling & validation (Phase 5)
6. **Week 3**: Testing & documentation (Phase 6-8)

## Risk Mitigation

- **Backup current codebase** before major changes
- **Test each phase** before proceeding to next
- **Maintain CLI fallback** for reliability  
- **Keep TUI optional** for backward compatibility
- **Gradual migration** from complex to simple

## Success Criteria

- ✅ No security vulnerabilities
- ✅ Clean TypeScript compilation with strict mode
- ✅ Working chat functionality via Vercel AI SDK
- ✅ Reliable CLI fallback
- ✅ Simplified, maintainable codebase
- ✅ Comprehensive test coverage
- ✅ Updated documentation