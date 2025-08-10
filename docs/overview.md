## Executive AI Assistant (EAIA)

### Summary
- Executive AI Assistant is a LangGraph-based agent that reads Gmail, triages messages, drafts replies, optionally rewrites for tone, and sends via Gmail/Calendar, with human-in-the-loop approval and self-reflection to improve prompts over time.
- Core flow: triage an email, decide action, draft using tool-calls, optionally consult calendar, get human approval/edits, then send and mark read. Reflection graphs update memory (tone/content/background/scheduling) from human feedback.

### Architecture
- **Runtime & deps**
  - Python 3.11; LangGraph, LangChain, OpenAI/Anthropic SDKs, Google API client; configured via `pyproject.toml`.
- **Config & secrets**
  - User prefs in `eaia/main/config.yaml` (email, name, background, triage rules, tone/schedule/response preferences, timezone, memory flag).
  - Secrets: Google OAuth tokens in `eaia/.secrets/`; env vars `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `LANGSMITH_API_KEY`, `GMAIL_SECRET`, `GMAIL_TOKEN`.
- **Data model**
  - `eaia/schemas.py`: `State` holds `email`, `triage`, `messages`. Tool schemas: `ResponseEmailDraft`, `NewEmailDraft`, `Question`, `MeetingAssistant`, `SendCalendarInvite`, `Ignore`.
- **Main graph (email agent)**
  - File: `eaia/main/graph.py`. Nodes: `triage_input`, `draft_response`, `send_message`, `rewrite`, `send_email_draft`, `send_email_node`, `send_cal_invite_node`, `mark_as_read_node`, `notify`, `find_meeting_time`, `bad_tool_name`, `human_node`.
  - Routing excerpt:
    ```python
    def route_after_triage(state: State):
        if state["triage"].response == "email":
            return "draft_response"
        elif state["triage"].response == "no":
            return "mark_as_read_node"
        elif state["triage"].response == "notify":
            return "notify"
        elif state["triage"].response == "question":
            return "draft_response"
    ```
    ```python
    def take_action(state: State):
        tool_call = state["messages"][-1].tool_calls[0]
        if tool_call["name"] == "Question":
            return "send_message"
        elif tool_call["name"] == "ResponseEmailDraft":
            return "rewrite"
        elif tool_call["name"] == "Ignore":
            return "mark_as_read_node"
        elif tool_call["name"] == "MeetingAssistant":
            return "find_meeting_time"
        elif tool_call["name"] == "SendCalendarInvite":
            return "send_cal_invite"
        else:
            return "bad_tool_name"
    ```
- **Agents & prompts**
  - Triage: `eaia/main/triage.py` uses user rules + few-shots to return `RespondTo`.
  - Drafting: `eaia/main/draft_response.py` uses tools (question, draft, meeting assistant, calendar invite). Persists preferences (schedule/background/response) in the store.
  - Rewrite: `eaia/main/rewrite.py` adjusts tone using stored `rewrite_instructions`.
  - Meeting time: `eaia/main/find_meeting_time.py` queries availability with `get_events_for_days`.
- **Human-in-the-loop**
  - `eaia/main/human_inbox.py`: interactive interrupts for questions, approving/editing drafts, notifications, and calendar invites. Saves triage examples; triggers reflection updates based on human feedback.
- **Reflection/memory**
  - `eaia/reflection_graphs.py`: graphs update stored prompts/memories (tone/content/background/schedule). Invoked after human interventions to refine behavior.
- **Gmail/Calendar integration**
  - `eaia/gmail.py`: OAuth, fetch emails (`fetch_group_emails`), send replies, mark as read, Calendar events + invite creation.
- **Scripts & deployment**
  - `scripts/run_ingest.py`: poll Gmail, map threads to LangGraph threads, create runs.
  - `scripts/run_single.py`: local test run against `main` graph.
  - `scripts/setup_cron.py`: register a cron to run ingestion every 10 minutes (LangGraph Cloud).
  - Local dev: `langgraph dev`; Prod: deploy to LangGraph Cloud; Agent Inbox can connect via graph ID `main`.
- **Control flow (high-level)**
  - Ingest email → `triage_input` → route:
    - no → `mark_as_read_node` → END
    - notify → `notify` → `human_node` → back to `draft_response`
    - email/question → `draft_response` → tool-call branch:
      - Question → `send_message` → `human_node` → back
      - MeetingAssistant → `find_meeting_time` → back
      - ResponseEmailDraft → `rewrite` → `send_email_draft` → `send_email_node` → `mark_as_read_node` → END
      - SendCalendarInvite → `send_cal_invite_node` → `draft_response`
- **Observability**
  - Uses `langgraph_sdk` and LangSmith tracing; reflection runs launched via client.
- **Customize**
  - Update `eaia/main/config.yaml`, `eaia/main/triage.py`, `eaia/main/rewrite.py`, `eaia/main/find_meeting_time.py`, `eaia/main/draft_response.py`.
