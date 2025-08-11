import type { ChatMessage } from "../chat/types";
import type { ResultAsync } from "neverthrow";
import type { ChatError } from "../types/errors";

export interface ChatProvider {
  chat(messages: ChatMessage[]): ResultAsync<string, ChatError>;
}
