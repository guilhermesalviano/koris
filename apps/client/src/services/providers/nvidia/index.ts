import type { AIChatOptions, AIChatRequest, AIProvider } from '../../../types/provider';
import { config } from '../../../config';
import { ILogger } from '../../../infrastructure/logger';
import { THINK_START, THINK_END } from '../../../constants/thinking';

type OpenAIMessage = {
  role: string;
  content?: string | null;
  tool_calls?: OpenAIToolCall[];
};

type OpenAIToolCall = {
  id?: string;
  index?: number;
  type?: 'function';
  function?: {
    name?: string;
    arguments?: string;
  };
};

type OpenAIChatResponse = {
  id?: string;
  choices?: Array<{
    message?: OpenAIMessage;
    finish_reason?: string | null;
  }>;
  error?: { message: string };
};

type OpenAIChatChunk = {
  id?: string;
  choices?: Array<{
    index?: number;
    delta?: {
      role?: string;
      content?: string;
      reasoning_content?: string;
      tool_calls?: OpenAIToolCall[];
    };
    finish_reason?: string | null;
  }>;
  error?: { message: string };
};

/** Accumulated tool call state during streaming */
type ToolCallAccumulator = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

class NvidiaAIProvider implements AIProvider {
  readonly name = 'nvidia';
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly apiToken: string;

  constructor(
    private readonly logger: ILogger,
    opts?: { baseUrl?: string; model?: string; apiToken?: string },
  ) {
    this.baseUrl = (opts?.baseUrl ?? config.AI.BASE_URL).replace(/\/+$/, '');
    this.defaultModel = opts?.model ?? config.AI.MODEL;
    this.apiToken = opts?.apiToken ?? config.AI.API_TOKEN;
  }

  async chat(request: AIChatRequest, options?: AIChatOptions): Promise<string> {
    const { controller, cleanup } = this.makeController(options?.signal);
    try {
      this.logger.debug('NVIDIA chat request', {
        model: request.model ?? this.defaultModel,
        messagesCount: request.messages.length,
        hasTools: !!request.tools?.length,
      });

      const res = await this.post(request, controller.signal, false);
      const data = await res.json() as OpenAIChatResponse;

      if (data.error) throw new Error(`NVIDIA API error: ${data.error.message}`);

      const choice = data.choices?.[0];
      if (!choice) throw new Error('NVIDIA response missing choices');

      const msg = choice.message;
      if (msg?.tool_calls?.length && !msg?.content?.trim()) {
        this.logger.debug('Tool calls in NVIDIA non-stream response', { count: msg.tool_calls.length });
        return JSON.stringify({ tool_calls: msg.tool_calls });
      }

      const content = msg?.content;
      if (!content) throw new Error('NVIDIA response missing content');
      return content;
    } catch (err) {
      this.logger.error('NVIDIA chat error', { error: err instanceof Error ? err.message : String(err) });
      if (this.isAbortError(err)) {
        throw new Error(options?.signal?.aborted ? 'NVIDIA request aborted' : 'NVIDIA request timed out');
      }
      throw err;
    } finally {
      cleanup();
    }
  }

  async *chatStream(request: AIChatRequest, options?: AIChatOptions): AsyncGenerator<string> {
    const { controller, cleanup } = this.makeController(options?.signal);

    let idleTimer: NodeJS.Timeout | undefined;
    const bumpIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => controller.abort(), config.AI.TIMEOUTS.IDLE_MS);
    };

    let totalChunksReceived = 0;
    let totalCharsYielded = 0;

    this.logger.debug('NVIDIA chatStream started', {
      model: request.model ?? this.defaultModel,
      messagesCount: request.messages.length,
      hasTools: !!request.tools?.length,
    });

    try {
      const res = await this.post(request, controller.signal, true);
      const body = res.body;

      if (!body) {
        this.logger.debug('NVIDIA stream body is null, falling back to non-stream');
        const full = await this.chatFallback(request, controller.signal);
        totalCharsYielded = full.length;
        yield full;
        return;
      }

      const toolCallAccumulator = new Map<number, ToolCallAccumulator>();
      let streamInThinking = false;
      let producedAnswer = false;

      bumpIdle();
      for await (const chunk of this.readSSE(body, bumpIdle)) {
        totalChunksReceived++;
        if (chunk.error) throw new Error(`NVIDIA stream error: ${chunk.error.message}`);

        const choice = chunk.choices?.[0];
        if (!choice) continue;

        const delta = choice.delta ?? {};

        // Reasoning/thinking content (some NVIDIA models)
        if (delta.reasoning_content) {
          if (!streamInThinking) {
            streamInThinking = true;
            yield THINK_START;
          }
          totalCharsYielded += delta.reasoning_content.length;
          yield delta.reasoning_content;
          continue;
        }

        if (streamInThinking && delta.content != null) {
          streamInThinking = false;
          yield THINK_END;
        }

        // Accumulate streamed tool calls
        if (delta.tool_calls?.length) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!toolCallAccumulator.has(idx)) {
              toolCallAccumulator.set(idx, {
                id: tc.id ?? '',
                type: 'function',
                function: { name: tc.function?.name ?? '', arguments: tc.function?.arguments ?? '' },
              });
            } else {
              const acc = toolCallAccumulator.get(idx)!;
              if (tc.id) acc.id = tc.id;
              if (tc.function?.name) acc.function.name += tc.function.name;
              if (tc.function?.arguments) acc.function.arguments += tc.function.arguments;
            }
          }
        }

        // Regular content
        if (delta.content) {
          producedAnswer = true;
          totalCharsYielded += delta.content.length;
          yield delta.content;
        }

        // Flush tool calls on finish
        if (choice.finish_reason === 'tool_calls' || choice.finish_reason === 'stop') {
          if (streamInThinking) {
            yield THINK_END;
            streamInThinking = false;
          }

          if (toolCallAccumulator.size > 0) {
            const toolCalls = Array.from(toolCallAccumulator.values());
            const json = JSON.stringify({ tool_calls: toolCalls });
            producedAnswer = true;
            totalCharsYielded += json.length;
            yield json;
          }
          break;
        }
      }

      if (streamInThinking) yield THINK_END;

      if (!producedAnswer) {
        this.logger.debug('No answer parsed from NVIDIA stream, retrying in non-stream mode');
        const full = await this.chatFallback(request, controller.signal);
        if (full) {
          totalCharsYielded += full.length;
          yield full;
        }
      }

      this.logger.info('NVIDIA chatStream complete', {
        model: request.model ?? this.defaultModel,
        chunksReceived: totalChunksReceived,
        charsYielded: totalCharsYielded,
      });
    } catch (err) {
      this.logger.error('NVIDIA chatStream error', {
        error: err instanceof Error ? err.message : String(err),
        chunksReceived: totalChunksReceived,
        charsYielded: totalCharsYielded,
      });

      if (this.isAbortError(err)) {
        if (options?.signal?.aborted) throw new Error('NVIDIA request aborted');
        throw new Error('NVIDIA request timed out while streaming');
      }
      throw err;
    } finally {
      clearTimeout(idleTimer);
      cleanup();
    }
  }

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.AI.TIMEOUTS.HEALTH_MS);
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: this.authHeaders(),
        signal: controller.signal,
      });
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
      return { ok: true, detail: 'ok' };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : 'unknown error' };
    } finally {
      clearTimeout(timer);
    }
  }

  private async chatFallback(request: AIChatRequest, signal: AbortSignal): Promise<string> {
    const res = await this.post(request, signal, false);
    const data = await res.json() as OpenAIChatResponse;

    if (data.error) throw new Error(`NVIDIA API error: ${data.error.message}`);

    const choice = data.choices?.[0];
    if (!choice) throw new Error('NVIDIA response missing choices');

    const msg = choice.message;
    if (msg?.tool_calls?.length && !msg?.content?.trim()) {
      return JSON.stringify({ tool_calls: msg.tool_calls });
    }

    const content = msg?.content;
    if (!content) throw new Error('NVIDIA response missing content');
    return content;
  }

  private makeController(outerSignal?: AbortSignal): { controller: AbortController; cleanup: () => void } {
    const controller = new AbortController();
    const hardTimer = setTimeout(() => controller.abort(), config.AI.TIMEOUTS.HARD_MS);

    if (!outerSignal) return { controller, cleanup: () => clearTimeout(hardTimer) };
    if (outerSignal.aborted) {
      controller.abort(outerSignal.reason);
      return { controller, cleanup: () => clearTimeout(hardTimer) };
    }

    const onAbort = () => controller.abort(outerSignal.reason);
    outerSignal.addEventListener('abort', onAbort, { once: true });
    return {
      controller,
      cleanup: () => {
        clearTimeout(hardTimer);
        outerSignal.removeEventListener('abort', onAbort);
      },
    };
  }

  private async *readSSE(
    body: ReadableStream<Uint8Array>,
    onBump: () => void,
  ): AsyncGenerator<OpenAIChatChunk> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        const text = decoder.decode(value ?? new Uint8Array(), { stream: !done });
        if (text) {
          onBump();
          buffer += text;
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const parsed = this.parseSSELine(line);
            if (parsed) yield parsed;
          }
        }
        if (done) break;
      }

      if (buffer.trim()) {
        const parsed = this.parseSSELine(buffer);
        if (parsed) yield parsed;
      }
    } finally {
      reader.releaseLock();
    }
  }

  private parseSSELine(line: string): OpenAIChatChunk | null {
    const trimmed = line.trim();
    if (!trimmed) return null;

    const data = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
    if (!data || data === '[DONE]') return null;

    try {
      return JSON.parse(data) as OpenAIChatChunk;
    } catch {
      return null;
    }
  }

  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.apiToken) headers['Authorization'] = `Bearer ${this.apiToken}`;
    return headers;
  }

  private async post(request: AIChatRequest, signal: AbortSignal, stream: boolean): Promise<Response> {
    const body: Record<string, unknown> = {
      model: request.model ?? this.defaultModel,
      messages: request.messages,
      stream,
    };

    if (request.tools?.length) body['tools'] = request.tools;
    if (request.temperature != null) body['temperature'] = request.temperature;

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(body),
      signal,
    });

    this.logger.debug('NVIDIA /chat/completions response', {
      status: res.status,
      stream,
      url: `${this.baseUrl}/chat/completions`,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const model = String(body['model'] ?? '');
      if (res.status === 404 && text.includes('page not found') && !model.includes('/')) {
        throw new Error(
          `NVIDIA model not found: "${model}". NVIDIA models require a namespace prefix (e.g., "google/gemma-4-31b-it"). ` +
          `Check available models at ${this.baseUrl}/models`,
        );
      }
      throw new Error(`NVIDIA /chat/completions failed (${res.status}): ${text}`);
    }

    return res;
  }

  private isAbortError(err: unknown): boolean {
    return err instanceof Error && (err.name === 'AbortError' || /aborted/i.test(err.message));
  }
}

class NvidiaAIProviderFactory {
  static create(logger: ILogger): AIProvider {
    return new NvidiaAIProvider(logger);
  }
}

export { NvidiaAIProvider, NvidiaAIProviderFactory };
