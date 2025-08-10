## Executive AI Assistant - TypeScript (Bun) Agent Architecture

This document describes the new Bun + TypeScript agent, built without LangGraph. It uses a simple, explicit loop (ReAct-style) and OpenAI function calling for tool use.

### Goals
- Provide a minimal, production-friendly agent core in TypeScript.
- Keep control flow explicit and testable without LangGraph.
- Make tools first-class: schema-validated (Zod), discoverable, and easy to extend.

### Core Capabilities
- Deterministic control loop with a clear step limit.
- Function-calling tools with JSON-schema surfaced to the model.
- Zod-based argument validation and typed tool execution.
- Stateless by default; can accept and return message history for memory.
- Works with Bun runtime for fast startup and dev ergonomics.

### Key Modules
- `src/agent/types.ts`: Shared types for messages, tool calls, and schemas.
- `src/agent/llm.ts`: Thin wrapper over OpenAI Chat Completions (supports function calling).
- `src/agent/tools.ts`: Tool registry, Zod schemas, and example tools (`web_search`, `calculator`).
- `src/agent/core.ts`: The agent loop: think → act (tool) → observe until final answer or step limit.
- `src/index.ts`: CLI entrypoint; accepts the goal as CLI args.

### Control Flow
1. Bootstrap messages with a system prompt and user goal.
2. Ask the LLM for the next action with `tools` advertised.
3. If the LLM returns tool calls:
   - Validate args via Zod and execute the tool handler.
   - Append an assistant tool-call stub and a `tool` message with the observation.
   - Loop to let the model incorporate observations.
4. If the LLM returns content, treat as final answer and stop.
5. Abort on reaching `maxSteps`.

### Extending Tools
Add a new Zod schema and register:

```ts
import { z } from "zod";
import { registerTool } from "@/agent/tools";

const FetchUrlArgs = z.object({ url: z.string().url() });
registerTool({
  name: "fetch_url",
  description: "Fetch a URL and return text content.",
  schema: FetchUrlArgs,
  execute: async (args) => {
    const { url } = FetchUrlArgs.parse(args);
    const res = await fetch(url);
    const text = await res.text();
    return { summary: `fetched ${url}`, result: text.slice(0, 2000) };
  },
});
```

### Configuration
- Model and temperature can be set when constructing `LLM` or by environment variables (via OpenAI SDK). Set `OPENAI_API_KEY` in your environment.

### Testing & Running
- Install deps: `bun install`
- Type check: `bun run check`
- Run: `bun start -- "your goal here"`

### Future Enhancements
- Streaming tokens and tool progress.
- Persistent memory with a message store.
- Retries and timeouts for tool and LLM calls.
- Observability hooks (events for each step/action).
- Guardrails for cost, rate limits, and tool allowlists.
