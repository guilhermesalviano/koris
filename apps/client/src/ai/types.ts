export type AIRole = 'system' | 'user' | 'assistant';

export interface AIMessage {
  role: AIRole;
  content: string;
}

export interface AIChatRequest {
  model?: string;
  messages: AIMessage[];
  temperature?: number;
}

export interface AIChatOptions {
  signal?: AbortSignal;
}

export interface AIProvider {
  readonly name: string;
  chat(request: AIChatRequest, options?: AIChatOptions): Promise<string>;
  chatStream(request: AIChatRequest, options?: AIChatOptions): AsyncGenerator<string>;
  healthCheck(): Promise<{ ok: boolean; detail?: string }>;
}
