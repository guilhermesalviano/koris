// import { ILogger } from '@/infrastructure/logger';
import { handleCommand, isCommand } from './commands';
import type { Instruction } from '../types';
import { detectInstruction, listDirectory, readFile, search } from 'sh-compression'; // remove it in future.

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

/**
 * Process user messages and generate responses
 * This is a mock implementation that will be replaced with Ollama integration
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

  // Mock instruction handling
  const instruction = detectInstruction(safeMessage);
  if (instruction) {
    // logger.log("info", `Detected instruction: ${instruction.type} with params: ${instruction.params}`);
    return handleInstruction(instruction, safeMessage);
  }

  // Default response
  return `I received your message: "${safeMessage}"\n\nI'm currently a mock agent. Ollama integration coming soon!`;
}

/**
 * Handle detected instructions with mock implementations
 */
async function handleInstruction(instruction: Instruction, originalMessage: string): Promise<string> {
  switch (instruction.type) {
    case 'read_file':
      return readFile(instruction.params);

    case 'write_file':
      return mockWriteFile(instruction.params, originalMessage);

    case 'list_dir':
      return listDirectory(instruction.params);

    case 'execute_command':
      return mockExecuteCommand(instruction.params);

    case 'search':
      return search(instruction.params);

    default:
      return `Unknown instruction type`;
  }
}

function mockWriteFile(filename: string, message: string): string {
  return `✍️ *Would create/update file: ${filename}*

Based on your message:
"${message}"

⚠️ This would normally require your approval before writing.

_This is a mock response. Real file operations will be implemented next._`;
}

function mockExecuteCommand(command: string): string {
  return `⚙️ *Would execute command:*

\`\`\`bash
${command}
\`\`\`

⚠️ This would normally require your approval before execution.

Expected output: [mock output]

_This is a mock response. Real command execution will be implemented with proper sandboxing._`;
}


