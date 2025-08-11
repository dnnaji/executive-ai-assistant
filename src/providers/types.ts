import type { ChatMessage } from "../chat/types";

export interface ChatProvider {
  chat(messages: ChatMessage[]): Promise<string>;
}
