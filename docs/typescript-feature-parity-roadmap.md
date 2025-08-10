## TS Feature Parity Roadmap (Python → TypeScript/Bun)

This roadmap maps the existing Python (LangGraph) implementation to a TypeScript/Bun implementation without LangGraph, targeting functional parity for the Executive AI Assistant (Gmail triage → draft/rewrite → send/mark/notify + calendar + human-in-the-loop + reflection).

### Current Python features (summary)
- Email triage, drafting, rewrite, meeting-time agent, calendar invite
- Gmail/Calendar IO (OAuth, fetch, send, mark-as-read, list events)
- Human-in-the-loop interrupts for questions, drafts, invites
- Reflection graphs to persist preferences and improve over time
- Ingestion cron polling Gmail and triggering runs per thread

### TS architecture (current status)
- Agent loop: ReAct-style with tool-calling and Ink TUI
- Tools: Zod-validated registry (`calculator`, `web_search` stub)
- LLM backends: OpenAI SDK or local CLI `ai`
- Docs: Architecture overview for the TS agent

---

## Milestone 1: Agent and tool contracts (core parity)
- Unify message/state types to mirror `eaia/schemas.py`:
  - `EmailData`, `RespondTo`, `ResponseEmailDraft`, `NewEmailDraft`, `ReWriteEmail`, `Question`, `Ignore`, `MeetingAssistant`, `SendCalendarInvite` (Zod)
  - Shared `AgentState` with `email`, `triage`, `messages`
- Implement nodes as functions with explicit transitions (state machine):
  - `triage_input` → `route_after_triage`
  - `draft_response` → `take_action`
  - `rewrite`, `send_email_draft`, `send_message`, `notify`, `find_meeting_time`, `send_cal_invite_node`, `send_email_node`, `mark_as_read_node`, `bad_tool_name`, `human_node`
- Replace heuristic fallback with strict tool-calling contract from the CLI LLM (or default to OpenAI SDK backend during dev)
- Add execution guards (max steps, retries) and structured error types

Deliverables:
- `src/agent/state.ts` (Zod schemas, types), `src/agent/graph.ts` (transition map), `src/agent/nodes/*`

## Milestone 2: Gmail + Calendar integration
- Implement Node equivalents of `eaia/gmail.py` via `googleapis`:
  - OAuth device/localhost flow; persist token/secret under `src/.secrets` (configurable)
  - `fetch_group_emails(to_email, minutes_since)`: query, expand threads, parse bodies (text/html), compute latest message side, return `EmailData`
  - `send_email(...)`, `mark_as_read(message_id)`
  - Calendar: `get_events_for_days(date_strs)`, `send_calendar_invite(...)`
- Add timezone formatting helpers

Deliverables:
- `src/integrations/google/auth.ts`, `gmail.ts`, `calendar.ts`
- Zod schemas for inputs/outputs; unit tests with mocks

## Milestone 3: Drafting flow + prompts
- Port prompts from `triage.py`, `draft_response.py`, `rewrite.py`, `find_meeting_time.py`
- Implement structured outputs for triage and rewrite; tool binding for draft tools
- Enforce tool names and argument validation (reject unknown tools, surface `bad_tool_name`)

Deliverables:
- `src/agents/triage.ts`, `draft.ts`, `rewrite.ts`, `meeting.ts`

## Milestone 4: Human-in-the-loop
- Provide interrupt surfaces similar to `human_inbox.py`:
  - In TUI: show action requests (Question/Draft/Invite/Notify) with options: ignore/respond/edit/accept
  - Persist triage examples and feedback
- Add interfaces to approve/modify drafts and invites

Deliverables:
- `src/human/index.ts` + TUI screens
- Persistence via simple KV (JSON files) initially; pluggable store interface

## Milestone 5: Reflection and memory
- Add store (file-based, then pluggable) for: rewrite instructions, response/schedule/background preferences
- Implement triggers post-human action to update memories (equivalent of reflection graphs)
- Optional: embed/index store (OpenAI text-embedding-3-small) via local cache or external vector store

Deliverables:
- `src/memory/store.ts`, `src/memory/reflection.ts`

## Milestone 6: Ingestion & scheduling
- Port `cron_graph.py` into a TS job:
  - Poll Gmail for new threads/messages
  - Map Gmail thread IDs to agent threads (stable UUID hashing)
  - Kick agent runs per thread; stop when user replies
- Provide a Bun cron script and optional external scheduler (launchd/systemd/cron)

Deliverables:
- `scripts/ts/run_ingest.ts`, `scripts/ts/setup_cron.ts`

## Milestone 7: Observability, config, tests
- Config: YAML/JSON config mapped from `eaia/main/config.yaml`
- Observability: structured logs, timings, events per node; optional OpenTelemetry hooks
- Tests:
  - Unit: tools, Gmail parsing, calendar formatting, state transitions
  - Integration: triage→draft→rewrite path with mocked LLM
  - E2E (optional): real Gmail sandbox with env-gated tests

Deliverables:
- `src/config/index.ts` (+ sample `config.example.yaml`)
- `tests/unit/*`, `tests/integration/*`; `bun test`

## Milestone 8: Productionization
- Env/secrets handling, .env support; docs for Google OAuth setup
- Binary packaging with `bun build` (optional)
- Dockerfile (optional)

---

### Backend strategy
- Dev: OpenAI SDK backend for reliable tool-calls; CLI `ai` backend supported with strict JSON tool_call contract
- Model defaults: `gpt-4o-mini` for cost/speed; override via config

### TUI/UX
- Current Ink TUI is single-pane. Future:
  - Panels: Inbox list, message detail, agent actions, approval controls
  - Keyboard shortcuts for actions; status bar with step timings

### Sequencing & ETA (rough)
- M1–M2 (core + Google IO): 3–5 days
- M3–M4 (prompts + human loop): 3–4 days
- M5–M6 (memory + ingestion): 3–4 days
- M7–M8 (tests + prod): 3–4 days

Total: ~12–17 days for full parity with polish. First usable version (triage/draft/send w/ approvals) in ~1 week.

### Risks / Decisions
- Google OAuth UX in terminal (fallback to device code if localhost port blocked)
- Tool-calling determinism with CLI backend vs SDK
- Reflection scope: start with simple KV; advanced vector memories later

