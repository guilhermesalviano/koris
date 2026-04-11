import type { AIChatRequest, AIProvider } from '../types';
import { config } from '../../config';

type OllamaChatChunk = {
  message?: { role?: string; content?: string; thinking?: string };
  response?: string;
  done?: boolean;
  error?: string;
};

type OllamaVersionResponse = {
  version?: string;
};

const IDLE_TIMEOUT_MS  = 30_000;
const HARD_TIMEOUT_MS  = 5 * 60_000;
const HEALTH_TIMEOUT_MS = 2_500;

export class OllamaAIProvider implements AIProvider {
  readonly name = 'ollama';

  private readonly baseUrl: string;
  private readonly defaultModel: string;

  constructor(opts?: { baseUrl?: string; model?: string }) {
    this.baseUrl      = (opts?.baseUrl ?? config.AI.BASE_URL).replace(/\/+$/, '');
    this.defaultModel = opts?.model    ?? config.AI.MODEL;
  }

  async chat(request: AIChatRequest): Promise<string> {
    const controller = new AbortController();

    const hardTimer = setTimeout(() => controller.abort(), HARD_TIMEOUT_MS);
    try {
      return await this.readJsonFallback(request, controller.signal);
    } catch (err) {
      if (this.isAbortError(err)) {
        throw new Error('Ollama request timed out while streaming');
      }
      throw err;
    } finally {
      clearTimeout(hardTimer);
    }
  }

  // ollama.provider.ts — add chatStream, reuses existing private helpers

  async *chatStream(request: AIChatRequest): AsyncGenerator<string> {
    const controller = new AbortController();

    let idleTimer: NodeJS.Timeout | undefined;
    const hardTimer = setTimeout(() => controller.abort(), HARD_TIMEOUT_MS);

    const bumpIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => controller.abort(), IDLE_TIMEOUT_MS);
    };

    bumpIdle();

    try {
      const body = await this.fetchStream(request, controller.signal);

      if (!body) {
        // Non-streaming fallback: yield the whole response as one chunk
        const full = await this.readJsonFallback(request, controller.signal);
        yield full;
        return;
      }

      for await (const chunk of this.readNDJSON(body, bumpIdle)) {
        if (chunk.error) throw new Error(chunk.error);
        const text = this.parseChunk(chunk);
        if (text) yield text;
        if (chunk.done) break;
      }
    } catch (err) {
      if (this.isAbortError(err)) {
        throw new Error('Ollama request timed out while streaming');
      }
      throw err;
    } finally {
      clearTimeout(idleTimer);
      clearTimeout(hardTimer);
    }
  }

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

    try {
      const res = await fetch(`${this.baseUrl}/api/version`, {
        signal: controller.signal,
      });

      if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };

      const data = (await res.json()) as OllamaVersionResponse;
      return { ok: true, detail: data.version ? `v${data.version}` : 'ok' };
    } catch (err) {
      return {
        ok: false,
        detail: err instanceof Error ? err.message : 'unknown error',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchStream(
    request: AIChatRequest,
    signal: AbortSignal,
  ): Promise<ReadableStream<Uint8Array> | null> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method : 'POST',
      headers: { 'content-type': 'application/json' },
      body   : JSON.stringify({
        model      : request.model ?? this.defaultModel,
        messages   : request.messages,
        stream     : true,
        temperature: request.temperature,
      }),
      signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Ollama /api/chat failed (${res.status}): ${text}`);
    }

    return res.body ?? null;
  }

  /** Fallback for proxies / servers that ignore stream:true */
  private async readJsonFallback(
    request: AIChatRequest,
    signal: AbortSignal,
  ): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method : 'POST',
      headers: { 'content-type': 'application/json' },
      body   : JSON.stringify({
        model      : request.model ?? this.defaultModel,
        messages   : request.messages,
        stream     : false,
        temperature: request.temperature,
      }),
      signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Ollama /api/chat (non-stream) failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as OllamaChatChunk;
    const content = this.parseChunk(data);
    if (!content) throw new Error('Ollama response missing content');
    return content;
  }

  /**
   * Async generator that reads NDJSON from a streaming response body.
   * Calls onBump() on every received chunk to reset the idle timeout.
   *
   * Streaming fix: the TextDecoder must be flushed *before* we stop
   * reading, not after — so we call decoder.decode(value, { stream: true })
   * on every chunk including the last one, then flush with decoder.decode()
   * only once the reader signals done.
   */
  private async *readNDJSON(
    body: ReadableStream<Uint8Array>,
    onBump: () => void,
  ): AsyncGenerator<OllamaChatChunk> {
    const reader  = body.getReader();
    const decoder = new TextDecoder();
    let   buffer  = '';

    try {
      while (true) {
        const { value, done } = await reader.read();

        // Flush decoder: always decode with stream=!done so the internal
        // buffer drains correctly on the very last read.
        const text = decoder.decode(value ?? new Uint8Array(), { stream: !done });

        if (text) {
          onBump();
          buffer += text;

          // Yield every complete line
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';  // keep incomplete tail

          for (const line of lines) {
            const parsed = this.parseLine(line);
            if (parsed) yield parsed;
          }
        }

        if (done) break;
      }

      // Flush any remaining bytes left in the buffer after EOF
      if (buffer.trim()) {
        const parsed = this.parseLine(buffer);
        if (parsed) yield parsed;
      }
    } finally {
      reader.releaseLock();
    }
  }

  private parseLine(line: string): OllamaChatChunk | null {
    const trimmed = line.trim();
    if (!trimmed) return null;

    try {
      return JSON.parse(trimmed) as OllamaChatChunk;
    } catch {
      return null;   // malformed line — skip silently
    }
  }

  private parseChunk(chunk: OllamaChatChunk): string {
    return chunk.message?.content ?? chunk.response ?? chunk.message?.thinking ?? '';
  }

  private isAbortError(err: unknown): boolean {
    return (
      err instanceof Error &&
      (err.name === 'AbortError' || /aborted/i.test(err.message))
    );
  }
}