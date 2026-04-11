import type { AIChatRequest, AIProvider } from '../types';
import { config } from '../../config';

type OllamaChatResponse = {
  message?: { role?: string; content?: string };
  response?: string;
  done?: boolean;
  error?: string;
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
          stream: true,
          temperature: request.temperature,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Ollama /api/chat failed (${res.status}): ${text}`);
      }

      // When stream=true, Ollama responds with NDJSON (one JSON object per line).
      // We'll accumulate message.content chunks into a final string.
      if (!res.body) {
        // Fallback (shouldn't happen in Node): try to read as JSON.
        const data = (await res.json()) as OllamaChatResponse;
        const content = data.message?.content ?? data.response;
        if (!content) throw new Error('Ollama response missing content');
        return content;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      let buffer = '';
      let out = '';

      const flushLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        let obj: OllamaChatResponse;
        try {
          obj = JSON.parse(trimmed) as OllamaChatResponse;
        } catch {
          // If we can't parse a line, ignore it; we'll still return what we have.
          return;
        }

        if (obj.error) {
          throw new Error(obj.error);
        }

        const chunk = obj.message?.content ?? obj.response;
        if (chunk) out += chunk;
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) flushLine(line);
      }

      // Flush remaining buffer
      if (buffer.trim()) {
        // Could be a final JSON line (or a full JSON response in some proxies)
        const maybeLines = buffer.split('\n');
        for (const line of maybeLines) flushLine(line);
      }

      if (!out) throw new Error('Ollama response missing content');
      return out;
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
