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

export interface AIProvider {
  readonly name: string;
  chat(request: AIChatRequest): Promise<string>;
  healthCheck(): Promise<{ ok: boolean; detail?: string }>;
}
