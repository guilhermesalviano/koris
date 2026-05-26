import type { Message } from "./messages";
import type { ProcessedMessage, ProcessOptions } from "./agents";

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

export interface IMessageProvider {
  handler(
    message: string,
    channel: string,
    options?: ProcessOptions,
    messageHistory?: Message[]
  ): Promise<ProcessedMessage>;
}