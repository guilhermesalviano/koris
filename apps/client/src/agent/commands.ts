import readline from 'readline';
import { config } from '../config';

export interface CommandContext {
  source: 'telegram' | 'tui';
  session?: {
    messageCount: number;
    startTime: Date;
  };
  rl?: readline.Interface;
}

export interface CommandResult {
  response?: string;
  action?: 'exit' | 'clear' | 'reset' | 'none';
  handled: boolean;
}

export function handleCommand(command: string, context: CommandContext): CommandResult {
  const cmd = command.toLowerCase().split(' ')[0];

  switch (cmd) {
    case '/start':
      return handleStart(context);

    case '/help':
      return handleHelp(context);

    case '/status':
      return handleStatus(context);

    case '/stats':
      return handleStats(context);

    case '/clear':
      return handleClear(context);

    case '/reset':
      return handleReset(context);

    case '/exit':
    case '/quit':
    case '/bye':
      return handleExit(context);

    default:
      return {
        response: formatMessage(
          `Unknown command: ${command}\nType /help for available commands`,
          context.source
        ),
        action: 'none',
        handled: false,
      };
  }
}

function handleStart(context: CommandContext): CommandResult {
  const message = context.source === 'telegram'
    ? `👋 *Welcome to opencrawdio!*

I'm an AI coding agent (provider: *${config.AI.PROVIDER}*). I can help you with:

• Reading and analyzing code
• Making file changes
• Running commands
• Answering coding questions

Just send me a message with what you need!`
    : `Welcome to opencrawdio!

I'm an AI coding agent (provider: ${config.AI.PROVIDER}) that can help you with:
• Reading and analyzing code
• Making file changes
• Running commands
• Answering coding questions

Type /help for available commands.`;

  return {
    response: message,
    action: 'none',
    handled: true,
  };
}

function handleHelp(context: CommandContext): CommandResult {
  const message = context.source === 'telegram'
    ? `*Available Commands:*

/start - Welcome message
/help - Show this help
/status - Check bot status
/clear - Clear conversation history

*Instructions I understand:*

• "read <file>" - Read a file
• "list <directory>" - List directory contents
• "search <term>" - Search in files
• "execute <command>" - Run a command
• "write <file>" - Create/update a file

Send me any message to interact!`
    : `Available Commands:

  /help     - Show this help message
  /start    - Welcome message
  /clear    - Clear the screen
  /stats    - Show session statistics
  /status   - Check bot status
  /reset    - Reset session statistics
  /exit     - Exit the TUI

Instructions I understand:

  • "read <file>" - Read a file
  • "list <directory>" - List directory contents
  • "search <term>" - Search in files
  • "execute <command>" - Run a command
  • "write <file>" - Create/update a file

Tips:
  • Press Ctrl+C to interrupt
  • Type naturally - no special format needed`;

  return {
    response: message,
    action: 'none',
    handled: true,
  };
}

function handleStatus(context: CommandContext): CommandResult {
  if (context.source === 'telegram') {
    return {
      response: `✅ *Bot Status*

• Connection: Active
• AI Provider: *${config.AI.PROVIDER}*
• Model: *${config.AI.MODEL}*
• Ready to assist!`,
      action: 'none',
      handled: true,
    };
  }

  return {
    response: `Status:

  Connection: Active
  AI Provider: ${config.AI.PROVIDER}
  Model: ${config.AI.MODEL}
  Base URL: ${config.AI.BASE_URL}`,
    action: 'none',
    handled: true,
  };
}

function handleStats(context: CommandContext): CommandResult {
  if (context.source === 'telegram') {
    return {
      response: `✅ *Bot Status*

• Connection: Active
• AI Provider: *${config.AI.PROVIDER}*
• Ready to assist!`,
      action: 'none',
      handled: true,
    };
  }

  if (!context.session) {
    return {
      response: 'Session statistics not available',
      action: 'none',
      handled: true,
    };
  }

  const uptime = Math.floor((Date.now() - context.session.startTime.getTime()) / 1000);
  const minutes = Math.floor(uptime / 60);
  const seconds = uptime % 60;

  return {
    response: `Session Statistics:

  Messages: ${context.session.messageCount}
  Uptime:   ${minutes}m ${seconds}s
  Started:  ${context.session.startTime.toLocaleTimeString()}`,
    action: 'none',
    handled: true,
  };
}

function handleClear(context: CommandContext): CommandResult {
  if (context.source === 'telegram') {
    return {
      response: '🗑️ Conversation history cleared!',
      action: 'clear',
      handled: true,
    };
  }

  return {
    response: '',
    action: 'clear',
    handled: true,
  };
}

function handleReset(context: CommandContext): CommandResult {
  if (context.source === 'telegram') {
    return {
      response: '🔄 Session reset!',
      action: 'reset',
      handled: true,
    };
  }

  return {
    response: '✓ Session reset',
    action: 'reset',
    handled: true,
  };
}

function handleExit(context: CommandContext): CommandResult {
  if (context.source === 'telegram') {
    return {
      response: 'Cannot exit Telegram bot. Use /start to restart.',
      action: 'none',
      handled: true,
    };
  }

  return {
    response: '👋 Goodbye!',
    action: 'exit',
    handled: true,
  };
}

function formatMessage(message: string, source: 'telegram' | 'tui'): string {
  // Telegram uses Markdown, TUI uses plain text
  if (source === 'telegram') {
    return message;
  }
  return message.replace(/\*/g, '');
}

/**
 * Check if a message is a command
 */
export function isCommand(message: string): boolean {
  return message.trim().startsWith('/');
}

/**
 * Get list of available commands
 */
export function getAvailableCommands(source: 'telegram' | 'tui'): string[] {
  const commonCommands = ['/start', '/help', '/clear'];
  
  if (source === 'tui') {
    return [...commonCommands, '/stats', '/status', '/reset', '/exit', '/quit', '/bye'];
  }
  
  return [...commonCommands, '/status'];
}
