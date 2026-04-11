import type { AIChatRequest, AIProvider } from '../types';
import { config } from '../../config';

type OllamaChatResponse = {
  message?: { role?: string; content?: string };
  response?: string;
};

type OllamaVersionResponse = {
  version?: string;
};

export class OllamaAIProvider implements AIProvider {
  readonly name = 'ollama';

  private baseUrl: string;
  private defaultModel: string;

  constructor(opts?: { baseUrl?: string; model?: string }) {
    this.baseUrl = (opts?.baseUrl ?? config.AI.BASE_URL).replace(/\/+$/, '');
    this.defaultModel = opts?.model ?? config.AI.MODEL;
  }

  async chat(request: AIChatRequest): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: request.model ?? this.defaultModel,
          messages: request.messages,
          stream: false,
          temperature: request.temperature,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Ollama /api/chat failed (${res.status}): ${text}`);
      }

      const data = (await res.json()) as OllamaChatResponse;
      const content = data.message?.content ?? data.response;
      if (!content) throw new Error('Ollama response missing content');
      return content;
    } finally {
      clearTimeout(timeout);
    }
  }

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2_500);

    try {
      const res = await fetch(`${this.baseUrl}/api/version`, { signal: controller.signal });
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
      const data = (await res.json()) as OllamaVersionResponse;
      return { ok: true, detail: data.version ? `v${data.version}` : 'ok' };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : 'unknown error' };
    } finally {
      clearTimeout(timeout);
    }
  }
}
