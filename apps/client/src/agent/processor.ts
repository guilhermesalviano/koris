import fs from 'node:fs/promises';
import path from 'node:path';

import { getAIProvider } from '../ai';
import { config } from '../config';
import type { Instruction } from '../types';
import { handleCommand, isCommand } from './commands';

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

      return [source === 'telegram' ? escapeTelegramMarkdown(header) : header, ...lines].join('\n');
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

async function handleFreeformChat(message: string): Promise<string> {
  const provider = getAIProvider();

  try {
    const content = await provider.chat({
      messages: [
        {
          role: 'system',
          content:
            'You are opencrawdio, a concise AI coding assistant. Be direct and helpful. If the user asks to read/list/search/write/run commands, describe what you would do and ask for approval when needed.',
        },
        { role: 'user', content: message },
      ],
    });

    return content;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return `I received your message: "${message}"\n\n(AI provider error: ${detail})`;
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
  source: 'telegram' | 'tui'
): Promise<string> {
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

  return handleFreeformChat(safeMessage);
}