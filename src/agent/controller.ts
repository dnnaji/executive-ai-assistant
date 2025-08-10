import type { ChatMessage } from "./types";

export const SYSTEM_PROMPT = `You are a helpful, reliable agent.
You can either:
- Call a tool when needed (choose one)
- Or produce a final answer.

Rules:
- Be concise and accurate.
- If you use a tool, think step-by-step but only return tool calls, not hidden thoughts.
- Stop when the user's task is satisfied.
`;

export function bootstrapMessages(
  userGoal: string,
  memory?: ChatMessage[]
): ChatMessage[] {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];
  if (memory && memory.length > 0) messages.push(...memory);
  messages.push({ role: "user", content: userGoal });
  return messages;
}
