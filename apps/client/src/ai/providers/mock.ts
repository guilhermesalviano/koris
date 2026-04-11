import type { AIChatRequest, AIProvider } from '../types';

export class MockAIProvider implements AIProvider {
  readonly name = 'mock';

  async chat(request: AIChatRequest): Promise<string> {
    const lastUser = [...request.messages].reverse().find((m) => m.role === 'user');
    const prompt = lastUser?.content || '';
    return `I received your message: "${prompt}"\n\n(Using mock AI provider — set AI_PROVIDER=ollama to enable Ollama.)`;
  }

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    return { ok: true, detail: 'mock provider' };
  }
}
