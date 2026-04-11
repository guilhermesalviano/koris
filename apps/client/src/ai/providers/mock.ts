import type { AIChatOptions, AIChatRequest, AIProvider } from '../types';

export class MockAIProvider implements AIProvider {
  readonly name = 'mock';

  async chat(request: AIChatRequest, _options?: AIChatOptions): Promise<string> {
    const lastUser = [...request.messages].reverse().find((m) => m.role === 'user');
    const prompt = lastUser?.content || '';
    return `I received your message: "${prompt}"\n\n(Using mock AI provider — set AI_PROVIDER=ollama to enable Ollama.)`;
  }

  async *chatStream(request: AIChatRequest, options?: AIChatOptions): AsyncGenerator<string> {
    const lastUser = [...request.messages].reverse().find((m) => m.role === 'user');
    const prompt = lastUser?.content || '';
    const response = `I received your message: "${prompt}"\n\n(Using mock AI provider — set AI_PROVIDER=ollama to enable Ollama.)`;

    for (const char of response) {
      if (options?.signal?.aborted) return;
      yield char;
    }
  }

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    return { ok: true, detail: 'mock provider' };
  }
}
