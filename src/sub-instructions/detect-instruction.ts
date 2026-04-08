import { Instruction } from "@/types";

/**
 * Detect instruction type from user message
 */
function detectInstruction(message: string): Instruction | null {
  const lower = message.toLowerCase();

  // Read file patterns
  if (lower.includes('read') || lower.includes('show me') || lower.includes('cat')) {
    const fileMatch = message.match(/(?:read|show(?:\s+me)?|cat)\s+["']?([^\s"']+)["']?/i);
    if (fileMatch?.[1]) {
      return { type: 'read_file', params: fileMatch[1] };
    }
  }

  // Write file patterns
  if (lower.includes('write') || lower.includes('create file') || lower.includes('save')) {
    const fileMatch = message.match(/(?:write|create(?:\s+file)?|save)\s+["']?([^\s"']+)["']?/i);
    if (fileMatch?.[1]) {
      return { type: 'write_file', params: fileMatch[1] };
    }
  }

  // List directory patterns
  if (lower.includes('list') || lower.includes('ls') || lower.includes('show directory')) {
    const dirMatch = message.match(/(?:list|ls|directory)\s+["']?([^\s"']+)["']?/i);
    return { type: 'list_dir', params: dirMatch?.[1] || '.' };
  }

  // Execute command patterns
  if (lower.includes('run') || lower.includes('execute') || lower.includes('command')) {
    const cmdMatch = message.match(/(?:run|execute)(?:\s+command)?\s+["']?(.+?)["']?$/i);
    if (cmdMatch?.[1]) {
      return { type: 'execute_command', params: cmdMatch[1] };
    }
  }

  // Search patterns
  if (lower.includes('search') || lower.includes('find')) {
    const searchMatch = message.match(/(?:search|find)\s+(?:for\s+)?["']?(.+?)["']?$/i);
    if (searchMatch?.[1]) {
      return { type: 'search', params: searchMatch[1] };
    }
  }

  return null;
}

export { detectInstruction }