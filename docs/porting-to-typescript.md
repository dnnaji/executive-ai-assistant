## Porting Executive AI Assistant (EAIA) to TypeScript

This guide outlines how to re-implement the Python EAIA in TypeScript with equivalent functionality: LangGraph orchestration, OpenAI/Anthropic LLMs, Gmail/Calendar, human-in-the-loop, reflection memory, and LangGraph Cloud deployment.

### Core library choices
- **Graph orchestration**: `@langchain/langgraph`
- **LLM providers**: `@langchain/openai`, `@langchain/anthropic`
- **Core primitives**: `@langchain/core`
- **SDKs**: `@langchain/langgraph-sdk` (interact with deployments), `@langchain/langsmith` (tracing)
- **Google APIs**: `googleapis` (Gmail + Calendar), `google-auth-library`
- **Validation**: `zod` (tool/response schemas), `zod-to-json-schema` (optional)
- **Config**: `yaml` (or `js-yaml`), `dotenv`
- **Date/time**: `date-fns` or `luxon`
- **Misc**: `uuid`, `node-fetch` (if not on Node 18+), `nodemailer` (optional for MIME composition)

### Project structure (suggested)
```
/ts
  /src
    /graph
      main.ts            # StateGraph wiring and routing
      triage.ts          # Triage node
      draftResponse.ts   # Drafting + tool-calls
      rewrite.ts         # Tone rewrite
      findMeetingTime.ts # Calendar lookup helper node
      humanInbox.ts      # Interrupt flows
    /integrations
      gmail.ts           # Gmail/Calendar wrappers
    /reflection
      reflectionGraphs.ts
    /config
      config.ts          # Load + validate YAML config
      config.yaml        # User prefs (ported from Python)
    /schemas
      state.ts           # TypeScript types + zod schemas
  package.json
  tsconfig.json
  .env.example
```

### State and schemas (TypeScript)
Use `zod` for runtime validation and TypeScript types for compile-time safety.

```ts
// src/schemas/state.ts
import { z } from "zod";
import { BaseMessage } from "@langchain/core/messages";

export const EmailData = z.object({
  id: z.string(),
  thread_id: z.string(),
  from_email: z.string(),
  subject: z.string(),
  page_content: z.string(),
  send_time: z.string(),
  to_email: z.string().optional(),
});

export const RespondTo = z.object({
  logic: z.string().default(""),
  response: z.enum(["no", "email", "notify", "question"]).default("no"),
});

export type EmailDataT = z.infer<typeof EmailData>;
export type RespondToT = z.infer<typeof RespondTo>;

export type State = {
  email: EmailDataT;
  triage: RespondToT;
  messages: BaseMessage[];
};
```

### Loading config
```ts
// src/config/config.ts
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import YAML from "yaml";

export const AppConfig = z.object({
  email: z.string(),
  full_name: z.string(),
  name: z.string(),
  background: z.string(),
  timezone: z.string(),
  schedule_preferences: z.string(),
  background_preferences: z.string(),
  response_preferences: z.string(),
  rewrite_preferences: z.string(),
  triage_no: z.string(),
  triage_notify: z.string(),
  triage_email: z.string(),
  memory: z.boolean().default(true),
});

export type AppConfigT = z.infer<typeof AppConfig>;

export function getConfig(): AppConfigT {
  const p = path.resolve(__dirname, "./config.yaml");
  const raw = fs.readFileSync(p, "utf-8");
  return AppConfig.parse(YAML.parse(raw));
}
```

### Main graph wiring
```ts
// src/graph/main.ts
import { StateGraph, END } from "@langchain/langgraph";
import type { State } from "../schemas/state";
import { triageInput } from "./triage";
import { draftResponse } from "./draftResponse";
import { rewrite } from "./rewrite";
import { sendEmailDraft, sendMessage, notify, sendCalInvite } from "./humanInbox";
import { sendEmailNode, sendCalInviteNode, markAsReadNode, findMeetingTime } from "./nodes";

export const graphBuilder = new StateGraph<State>({
  channels: {
    email: null,
    triage: null,
    messages: { value: [] },
  },
});

function routeAfterTriage(state: State) {
  switch (state.triage.response) {
    case "email":
    case "question":
      return "draft_response";
    case "no":
      return "mark_as_read_node";
    case "notify":
      return "notify";
    default:
      throw new Error("unknown triage");
  }
}

function takeAction(state: State) {
  const prediction = state.messages[state.messages.length - 1] as any;
  const toolCall = prediction?.tool_calls?.[0];
  switch (toolCall?.name) {
    case "Question": return "send_message";
    case "ResponseEmailDraft": return "rewrite";
    case "Ignore": return "mark_as_read_node";
    case "MeetingAssistant": return "find_meeting_time";
    case "SendCalendarInvite": return "send_cal_invite";
    default: return "bad_tool_name";
  }
}

graphBuilder.addNode("triage_input", triageInput);
graphBuilder.addNode("draft_response", draftResponse);
graphBuilder.addNode("rewrite", rewrite);
graphBuilder.addNode("send_message", sendMessage);
graphBuilder.addNode("send_email_draft", sendEmailDraft);
graphBuilder.addNode("send_email_node", sendEmailNode);
graphBuilder.addNode("send_cal_invite_node", sendCalInviteNode);
graphBuilder.addNode("send_cal_invite", sendCalInvite);
graphBuilder.addNode("mark_as_read_node", markAsReadNode);
graphBuilder.addNode("find_meeting_time", findMeetingTime);
graphBuilder.addNode("notify", notify);

graphBuilder.setEntryPoint("triage_input");
graphBuilder.addConditionalEdges("triage_input", routeAfterTriage);
graphBuilder.addConditionalEdges("draft_response", takeAction);
// ... add edges mirroring Python

export const graph = graphBuilder.compile();
```

### Triage node (structured output)
```ts
// src/graph/triage.ts
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import type { State } from "../schemas/state";
import { getConfig } from "../config/config";

const RespondToSchema = z.object({
  logic: z.string().default(""),
  response: z.enum(["no", "email", "notify", "question"]).default("no"),
});

type RespondToT = z.infer<typeof RespondToSchema>;

export async function triageInput(state: State) {
  const cfg = getConfig();
  const prompt = /* build prompt from cfg + state.email */ "...";
  const llm = new ChatOpenAI({ model: "gpt-4o", temperature: 0 });
  const model = llm.withStructuredOutput(RespondToSchema);
  const result = await model.invoke(prompt) as RespondToT;
  return { triage: result };
}
```

### Drafting node with tools
Use `zod` tool schemas and `bindTools`. Implement retry if no tool call.

```ts
// src/graph/draftResponse.ts
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import type { State } from "../schemas/state";

const NewEmailDraft = z.object({ content: z.string(), recipients: z.array(z.string()) });
const ResponseEmailDraft = z.object({ content: z.string(), new_recipients: z.array(z.string()) });
const Question = z.object({ content: z.string() });
const MeetingAssistant = z.object({ call: z.boolean() });
const SendCalendarInvite = z.object({ emails: z.array(z.string()), title: z.string(), start_time: z.string(), end_time: z.string() });
const Ignore = z.object({ ignore: z.boolean() });

export async function draftResponse(state: State) {
  const llm = new ChatOpenAI({ model: "gpt-4o", temperature: 0 });
  const tools = { NewEmailDraft, ResponseEmailDraft, Question, MeetingAssistant, SendCalendarInvite, ...(state.messages.length ? { Ignore } : {}) };
  const model = llm.bindTools(tools);
  const input = /* instructions + email thread */ "...";
  let messages: any[] = [{ role: "user", content: input }, ...state.messages];
  for (let i = 0; i < 5; i++) {
    const response: any = await model.invoke(messages);
    if (response.tool_calls?.length === 1) {
      return { draft: response, messages: [response] };
    }
    messages.push({ role: "user", content: "Please call a valid tool call." });
  }
  return { draft: null };
}
```

### Rewrite node
```ts
// src/graph/rewrite.ts
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";

const ReWriteEmail = z.object({
  tone_logic: z.string(),
  rewritten_content: z.string(),
});

export async function rewrite(state: any, config: any, store: any) {
  const llm = new ChatOpenAI({ model: "gpt-4o", temperature: 0 });
  const model = llm.withStructuredOutput(ReWriteEmail);
  // build prompt using rewrite instructions from store
  const response = await model.invoke("...");
  return { messages: [{ role: "assistant", content: response.rewritten_content }] };
}
```

### Human-in-the-loop interrupts
```ts
// src/graph/humanInbox.ts
import { interrupt } from "@langchain/langgraph";

export async function sendMessage(state: any) {
  const request = [{ action_request: { action: "Question", args: {/*...*/} }, config: { allow_ignore: true, allow_respond: true, allow_edit: false, allow_accept: false }, description: "...markdown..." }];
  const [response] = interrupt(request);
  // translate response -> tool message or ignore
  return { messages: [/* ... */] };
}
```

### Gmail/Calendar integration (Node)
```ts
// src/integrations/gmail.ts
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";

export function getOAuthClient(): OAuth2Client {
  const client = new google.auth.OAuth2(process.env.GMAIL_CLIENT_ID, process.env.GMAIL_CLIENT_SECRET, process.env.GMAIL_REDIRECT_URI);
  client.setCredentials(JSON.parse(process.env.GMAIL_TOKEN_JSON!));
  return client;
}

export async function fetchGroupEmails(toEmail: string, minutesSince = 60) {
  const auth = getOAuthClient();
  const gmail = google.gmail({ version: "v1", auth });
  // list + get + parse raw bodies, similar to Python
}

export async function sendEmail(/* thread id, content, addl recipients */) {
  const auth = getOAuthClient();
  const gmail = google.gmail({ version: "v1", auth });
  // compose MIME and send base64 raw
}

export async function sendCalendarInvite(/* emails, title, start, end */) {
  const auth = getOAuthClient();
  const calendar = google.calendar({ version: "v3", auth });
  // insert event with attendees + meet link
}
```

### Reflection graphs
- Mirror `eaia/reflection_graphs.py` with a small graph in TS that:
  - Chooses which prompt types to update (tone/email/background/calendar) via model output.
  - Writes updated strings to your store.
- Use `@langchain/langgraph` store implementations (e.g., `MemorySaver`, SQLite) or plug in your own persistence.

### Ingestion and cron (Node)
- Ingest script mirrors `scripts/run_ingest.py`:
  - Hash Gmail `thread_id` to a stable UUID.
  - Create/update threads via `@langchain/langgraph-sdk`.
  - Create runs for the `main` graph.
- Cron:
  - Use LangGraph Cloud crons via the JS SDK, or a platform scheduler.

### Deployment
- Local dev: run a small Node server exposing your graph to `langgraph dev` (CLI) or use the LangGraph JS dev server if available.
- Cloud: connect GitHub repo to LangGraph Cloud, set env vars: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `LANGSMITH_API_KEY`, `GMAIL_TOKEN_JSON`, etc.
- Agent Inbox: point to graph id `main` and your deployment URL.

### Mapping: Python → TypeScript
- `eaia/main/graph.py` → `src/graph/main.ts` (StateGraph wiring)
- `eaia/main/triage.py` → `src/graph/triage.ts` (structured output)
- `eaia/main/draft_response.py` → `src/graph/draftResponse.ts` (tools + retries)
- `eaia/main/rewrite.py` → `src/graph/rewrite.ts`
- `eaia/main/find_meeting_time.py` → `src/graph/findMeetingTime.ts`
- `eaia/main/human_inbox.py` → `src/graph/humanInbox.ts` (interrupts)
- `eaia/gmail.py` → `src/integrations/gmail.ts`
- `eaia/reflection_graphs.py` → `src/reflection/reflectionGraphs.ts`
- `eaia/main/config.yaml` → `src/config/config.yaml` (+ `config.ts` loader)
- `scripts/*.py` → `scripts/*.ts` using `@langchain/langgraph-sdk`

### Example package.json (minimal)
```json
{
  "name": "eaia-ts",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p .",
    "dev": "ts-node src/dev.ts",
    "ingest": "ts-node scripts/runIngest.ts",
    "test": "vitest"
  },
  "dependencies": {
    "@langchain/core": "^0.2",
    "@langchain/langgraph": "^0.4",
    "@langchain/langgraph-sdk": "^0.1",
    "@langchain/langsmith": "^0.2",
    "@langchain/openai": "^0.2",
    "@langchain/anthropic": "^0.2",
    "googleapis": "^129.0.0",
    "google-auth-library": "^9.0.0",
    "yaml": "^2.4.0",
    "dotenv": "^16.4.0",
    "zod": "^3.23.0",
    "date-fns": "^3.6.0",
    "uuid": "^9.0.1"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "ts-node": "^10.9.2",
    "vitest": "^2.0.0"
  }
}
```

### Migration checklist
- [ ] Recreate `State`, tool schemas, and prompts in TS
- [ ] Port triage/draft/rewrite/findMeetingTime logic
- [ ] Implement Gmail/Calendar wrappers with `googleapis`
- [ ] Implement human interrupts and reflection graphs
- [ ] Implement ingestion script using `@langchain/langgraph-sdk`
- [ ] Add config loader and YAML file
- [ ] Wire edges/routes to match Python graph
- [ ] Add env handling; verify OAuth tokens
- [ ] Run locally with dev server; connect Agent Inbox
- [ ] Deploy to LangGraph Cloud; set up cron

Notes
- Prefer `zod` schemas for tools and structured outputs to keep parity with Pydantic models.
- Keep tool names identical to Python to reuse UI and workflow conventions.
- Avoid making up email addresses; validate with regex or domain allow-lists if needed.
- For Node 18+, native `fetch` is available; otherwise add `node-fetch`.
