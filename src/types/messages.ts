export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface MessageToolCall {
  id?: string;
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface Message {
  role: MessageRole;
  content: string;
  tool_call_id?: string;
  tool_calls?: MessageToolCall[];
}