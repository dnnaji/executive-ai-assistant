export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
};

export type ToolSchema = {
  name: string;
  description: string;
  parameters: unknown; // JSON Schema
};

export type ToolResult = {
  summary: string;
  result: unknown;
};
