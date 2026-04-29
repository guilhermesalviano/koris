import { Message } from "../repositories/prompt";

export type AIRole = 'system' | 'user' | 'assistant';

export interface AIToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface AIChatRequest {
  model?: string;
  messages: Message[];
  temperature?: number;
  tools?: AIToolDefinition[];
  /** When true, instructs the provider to emit a thinking/reasoning block. */
  think?: boolean;
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
