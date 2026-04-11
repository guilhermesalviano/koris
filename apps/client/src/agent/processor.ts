import fs from 'node:fs/promises';
import path from 'node:path';

import { getAIProvider } from '../ai';
import { config } from '../config';
import type { Instruction } from '../types';
import { handleCommand, isCommand } from './commands';

type ProcessedMessage = string | AsyncGenerator<string>;
type ProcessOptions = { signal?: AbortSignal };

function toSafeMessage(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input === null || input === undefined) return '';
  try {
    return String(input);
  } catch {
    return '';
  }
}

function previewMessage(message: string, maxLen = 200): string {
  const trimmed = message.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen)}…`;
}

function escapeTelegramMarkdown(text: string): string {
  // Tests expect escaping for '.' and '-' at minimum.
  // NOTE: Telegram "Markdown" vs "MarkdownV2" escaping differs; keep it minimal + test-driven.
  return text.replace(/([\\._-])/g, '\\$1');
}

function detectInstruction(message: string): Instruction {
  const trimmed = message.trim();
  if (!trimmed) return { type: 'unknown', params: '' };

  const readMatch = trimmed.match(/^(read|show|cat)\s+["']?([^\s"']+)["']?/i);
  if (readMatch) return { type: 'read_file', params: readMatch[2] };

  const listMatch = trimmed.match(/^(list|ls|directory)\s+["']?([^\s"']+)["']?/i);
  if (listMatch) return { type: 'list_dir', params: listMatch[2] };

  const writeMatch = trimmed.match(/^(write|create|save).*?["']?([^\s"']+)["']?/i);
  if (writeMatch) return { type: 'write_file', params: writeMatch[2] };

  const execMatch = trimmed.match(/^(run|execute)(?:\s+command)?\s+["']?(.+?)["']?$/i);
  if (execMatch) return { type: 'execute_command', params: execMatch[2] };

  const searchMatch = trimmed.match(/^(search|find)\s+(?:for\s+)?["']?(.+?)["']?$/i);
  if (searchMatch) return { type: 'search', params: searchMatch[2] };

  return { type: 'unknown', params: trimmed };
}

function resolveWithinBaseDir(userPath: string): string {
  const baseDir = config.BASE_DIR;
  const normalized = userPath.replace(/\0/g, '');
  const resolved = path.resolve(baseDir, normalized);
  const rel = path.relative(baseDir, resolved);

  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Path escapes base directory');
  }

  return resolved;
}

async function handleInstruction(instruction: Instruction, source: 'telegram' | 'tui'): Promise<string> {
  switch (instruction.type) {
    case 'read_file': {
      const target = instruction.params;
      const label = source === 'telegram' ? escapeTelegramMarkdown(target) : target;
      // Keep it lightweight for now (no full file dump in chat).
      return `Reading file: ${label}`;
    }

    case 'list_dir': {
      const target = instruction.params || '.';
      const resolved = resolveWithinBaseDir(target);
      const entries = await fs.readdir(resolved, { withFileTypes: true });

      const displayTarget = source === 'telegram' ? escapeTelegramMarkdown(target) : target;
      const header = `Directory listing for: ${displayTarget}`;

      const lines = entries
        .slice(0, 50)
        .map((e) => {
          const name = e.name + (e.isDirectory() ? '/' : '');
          return `- ${source === 'telegram' ? escapeTelegramMarkdown(name) : name}`;
        });

      return [source === 'telegram' ? header : header, ...lines].join('\n');
    }

    case 'search': {
      const query = instruction.params;
      const shown = source === 'telegram' ? escapeTelegramMarkdown(query) : query;
      return `Searching for: ${shown}\n\n(mock search — tool integration coming next)`;
    }

    case 'write_file':
      return `This is a mock response for create/update file: ${instruction.params}.\nRequires approval before writing. (mock response, approval)`;

    case 'execute_command':
      return `This is a mock response to execute command: ${instruction.params}.\nRequires approval before running. (mock response, approval)`;

    default:
      return '';
  }
}

async function handleStreamChat(
  message: string,
  source: 'telegram' | 'tui',
  options?: ProcessOptions
): Promise<ProcessedMessage> {
  const provider = getAIProvider();
  const request = {
    messages: [
      {
        role: 'system' as const,
        content:
          'You are opencrawdio, a concise AI Assistant. Be direct and helpful. If the user asks to read/list/search/write/run commands, describe what you would do and ask for approval when needed.',
      },
      { role: 'user' as const, content: message },
    ],
  };

  // Stream directly in TUI when using Ollama.
  if (source === 'tui' && provider.name === 'ollama') {
    const stream = provider.chatStream(request, { signal: options?.signal });

    async function* safeStream(): AsyncGenerator<string> {
      try {
        for await (const chunk of stream) {
          if (options?.signal?.aborted) return;
          yield chunk;
        }
      } catch (err) {
        if (options?.signal?.aborted || isAbortError(err)) return;
        const detail = err instanceof Error ? err.message : String(err);
        yield `\n(AI provider error: ${detail})`;
      }
    }

    return safeStream();
  }

  try {
    return await provider.chat(request, { signal: options?.signal });
  } catch (err) {
    if (options?.signal?.aborted || isAbortError(err)) {
      throw err;
    }
    const detail = err instanceof Error ? err.message : String(err);
    return source === 'telegram'
      ? `I received your message: "${escapeTelegramMarkdown(message)}"\n\n(AI provider error: ${escapeTelegramMarkdown(detail)})`
      : `I received your message: "${message}"\n\n(AI provider error: ${detail})`;
  }
}

async function handleChat(
  message: string,
  source: 'telegram' | 'tui',
  options?: ProcessOptions
): Promise<ProcessedMessage> {
  const provider = getAIProvider();
  const request = {
    messages: [
      {
        role: 'system' as const,
        content:
          'You are opencrawdio, a concise AI Assistant. Be direct and helpful. If the user asks to read/list/search/write/run commands, describe what you would do and ask for approval when needed.',
      },
      { role: 'user' as const, content: message },
    ],
  };

  try {
    return await provider.chat(request, { signal: options?.signal });
  } catch (err) {
    if (options?.signal?.aborted || isAbortError(err)) {
      throw err;
    }
    const detail = err instanceof Error ? err.message : String(err);
    return source === 'telegram'
      ? `I received your message: "${escapeTelegramMarkdown(message)}"\n\n(AI provider error: ${escapeTelegramMarkdown(detail)})`
      : `I received your message: "${message}"\n\n(AI provider error: ${detail})`;
  }
}

/**
 * Process user messages and generate responses.
 * Commands are handled centrally. For non-commands we first detect built-in instructions,
 * otherwise we fall back to the configured AI provider (default: Ollama).
 */
export async function processUserMessage(
  // logger: ILogger,
  message: unknown,
  source: 'telegram' | 'tui',
  options?: ProcessOptions
): Promise<ProcessedMessage> {
  const safeMessage = toSafeMessage(message);

  // Keep logs lightweight (tests may send very large inputs)
  console.log(`Processing message from ${source}: "${previewMessage(safeMessage)}"`);

  // Handle commands using centralized handler
  if (isCommand(safeMessage)) {
    const result = handleCommand(safeMessage, { source });
    return result.response || '';
  }

  const instruction = detectInstruction(safeMessage);
  if (instruction.type !== 'unknown') {
    return handleInstruction(instruction, source);
  }

  if (source === 'tui') {
    return handleStreamChat(safeMessage, source, options);
  }
  return await handleChat(safeMessage, source, options);
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || /aborted/i.test(err.message));
}

export async function healthCheck(): Promise<{ status: 'ok' | 'error'; timestamp: string; details?: string }> {
  const provider = getAIProvider();
  try {
    const health = await provider.healthCheck();
    return { status: health.ok === true ? 'ok' : 'error', timestamp: new Date().toISOString() };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { status: 'error', timestamp: new Date().toISOString(), details: detail };
  }
}
