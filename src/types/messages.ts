export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface MessageToolCall {
  id?: string;
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface ImageAttachment {
  data: string;
  mimeType?: string;
}

export interface Message {
  role: MessageRole;
  content: string;
  images?: ImageAttachment[];
  tool_call_id?: string;
  tool_calls?: MessageToolCall[];
}