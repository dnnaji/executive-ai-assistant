## Executive AI Assistant (TypeScript)

A small, local-first CLI/TUI chat agent. It renders Markdown nicely in your terminal and supports a safe calculator tool. By default it shells out to a local `ai` command; you can also wire it to OpenAI via the provided `LLM` class.

### Features
- TUI chat experience powered by Ink
- Markdown-to-ANSI rendering with code highlighting
- Simple tool calling with a safe calculator (mathjs)
- Optional local `ai` CLI integration; optional OpenAI client

### Requirements
- Bun 1.1+ (tested on Bun 1.2.x)
- Node.js is not required

### Install
```bash
bun install
```

### Run
- TUI mode:
```bash
bun start
```

- One-off prompt (prints Markdown-rendered answer):
```bash
bun src/index.ts "Explain HTTP/2 vs HTTP/3"
```

### Optional: How responses are generated
By default the agent uses a local `ai` command (CLI) to generate responses. If that command is not available, you will still be able to use the calculator tool, but chat replies will fail.

Options:
- Install or alias a local `ai` CLI that accepts a prompt and returns either plain text or a JSON tool-call envelope as documented in `src/agent/llm_cli.ts`.
- Or, instantiate the agent with the built-in OpenAI client:

```ts
import { AgentRunner } from "./src/agent/core";
import { LLM } from "./src/agent/llm";

const agent = new AgentRunner({ llm: new LLM() });
```

Set `OPENAI_API_KEY` in your environment if you use the OpenAI client.

### Markdown rendering
We render Markdown to ANSI using `marked` + `marked-terminal`, with optional code highlighting via `cli-highlight`. Width is respected based on your terminal columns.

### Project structure
```
src/
  agent/           # Agent runner, tools, LLM adapters
  markdown/        # Markdown -> ANSI renderer
  tui/             # Ink-based TUI
  index.ts         # Entry point
```

### Development
- Type-check: `bun x tsc -p tsconfig.json --noEmit`
- Dev TUI: `bun dev`

### Security note
The calculator tool uses `mathjs.evaluate()` instead of `Function()` to avoid code execution risks.

### Roadmap
- Replace `openai` SDK with Vercel AI SDK (`ai`, `@ai-sdk/openai`) and keep CLI fallback.
- Optionally remove tool orchestration and `zod-to-json-schema` once simplified chat is adopted.
