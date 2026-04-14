import { ILogger } from '../../../infrastructure/logger';
import type { AIChatOptions, AIChatRequest, AIProvider } from '../../../types/provider';

class MockAIProvider implements AIProvider {
  readonly name: string;
  private readonly logger: ILogger;

  constructor(logger: ILogger, name: string = 'mock') {
    this.logger = logger;
    this.name = name;
  }

  async chat(request: AIChatRequest, _options?: AIChatOptions): Promise<string> {
    const lastUser = [...request.messages].reverse().find((m) => m.role === 'user');
    const prompt = lastUser?.content || '';
    
    this.logger.debug('Mock provider chat request', { 
      messagesCount: request.messages.length,
      hasTools: !!request.tools?.length,
    });
    
    const response = `I received your message: "${prompt}"\n\n(Using mock AI provider — set AI_PROVIDER=ollama to enable Ollama.)`;
    
    this.logger.info('Mock provider chat response', {
      responseLength: response.length,
    });
    
    return response;
  }

  async *chatStream(request: AIChatRequest, options?: AIChatOptions): AsyncGenerator<string> {
    const lastUser = [...request.messages].reverse().find((m) => m.role === 'user');
    const prompt = lastUser?.content || '';
    
    this.logger.debug('Mock provider chatStream started', { 
      messagesCount: request.messages.length,
      hasTools: !!request.tools?.length,
    });
    
    const response = `I received your message: "${prompt}"\n\n(Using mock AI provider — set AI_PROVIDER=ollama to enable Ollama.)`;

    for (const char of response) {
      if (options?.signal?.aborted) return;
      yield char;
    }
    
    this.logger.info('Mock provider chatStream complete', {
      responseLength: response.length,
    });
  }

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    this.logger.debug('Mock provider health check');
    return { ok: true, detail: 'mock provider' };
  }
}

class MockAIProviderFactory {
  static create(logger: ILogger, name?: string): AIProvider {
    return new MockAIProvider(logger, name);
  }
}

export { MockAIProviderFactory };