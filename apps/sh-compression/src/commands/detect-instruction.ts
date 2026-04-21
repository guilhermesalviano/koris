import type { Instruction } from '../types';

function sanitizeFilename(input: string): string {
  // Strip null bytes + common shell metacharacters that should never appear in a filename.
  // Keep this conservative: detection should still work, but params must be safe.
  return input
    .replace(/\0/g, '')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[`$|;&<>]/g, '')
    .trim();
}

function parseSearchParams(input: string): string | null {
  const lower = input.toLowerCase();

  let rest: string;
  if (lower.startsWith('search')) {
    rest = input.slice('search'.length);
  } else if (lower.startsWith('find')) {
    rest = input.slice('find'.length);
  } else {
    return null;
  }

  rest = rest.trimStart();
  if (!rest) return null;

  if (rest.toLowerCase().startsWith('for')) {
    const afterFor = rest.slice('for'.length);
    if (/^\s/.test(afterFor)) {
      rest = afterFor.trimStart();
    }
  }

  if (!rest) return null;

  if (
    (rest.startsWith('"') && rest.endsWith('"') && rest.length >= 2) ||
    (rest.startsWith("'") && rest.endsWith("'") && rest.length >= 2)
  ) {
    rest = rest.slice(1, -1).trim();
  }

  return rest || null;
}

/**
 * Detect instruction type from user message.
 */
function detectInstruction(message: string): Instruction | null {
  if (typeof message !== 'string') return null;

  const trimmed = message.trim();
  if (!trimmed) return null;

  // Ignore slash commands (handled elsewhere)
  if (trimmed.startsWith('/')) return null;

  const lower = trimmed.toLowerCase();

  // Read file patterns
  if (lower.includes('read') || lower.includes('show me') || lower.includes('cat')) {
    const fileMatch = trimmed.match(/(?:read|show(?:\s+me)?|cat)\s+["']?([^\s"']+)["']?/i);
    if (fileMatch?.[1]) {
      return { type: 'read_file', params: fileMatch[1] };
    }
  }

  // Write file patterns
  if (lower.includes('write') || lower.includes('create file') || lower.includes('save')) {
    const fileMatch = trimmed.match(/(?:write|create(?:\s+file)?|save)\s+["']?([^\s"']+)["']?/i);
    if (fileMatch?.[1]) {
      const safe = sanitizeFilename(fileMatch[1]);
      if (!safe) return null;
      return { type: 'write_file', params: safe };
    }
  }

  // List directory patterns
  if (lower.includes('list') || lower.includes('ls') || lower.includes('show directory')) {
    const dirMatch = trimmed.match(/(?:list|ls|directory)\s+["']?([^\s"']+)["']?/i);
    return { type: 'list_dir', params: dirMatch?.[1] || '.' };
  }

  // Execute command patterns
  if (lower.includes('run') || lower.includes('execute') || lower.includes('command')) {
    const cmdMatch = trimmed.match(/(?:run|execute)(?:\s+command)?\s+["']?(.+?)["']?$/i);
    if (cmdMatch?.[1]) {
      return { type: 'execute_command', params: cmdMatch[1] };
    }
  }

  // Search patterns
  if (lower.includes('search') || lower.includes('find')) {
    const params = parseSearchParams(trimmed);
    if (params) {
      return { type: 'search', params };
    }
  }

  return null;
}

export { detectInstruction };
