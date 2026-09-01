import { config } from '../../config';
import { handleUsageCommand } from './usage';
import { addAllowedDomain } from '../security/allowed-domains';
import {
  commandToken,
  findCommand,
  isKnownCommand,
  listCommandsFor,
} from './registry';
import type { CommandContext, CommandResult } from '../../types/commands';

export { SLASH_COMMANDS, findCommand, isKnownCommand } from './registry';
export type { CommandSpec, CommandChannel } from './registry';

export function handleCommand(command: string, context: CommandContext): CommandResult {
  switch (commandToken(command)) {
    case '/help':
      return handleHelp(command, context);

    case '/status':
      return handleStatus(context);

    case '/usage':
      return handleUsageCommand(command, context);

    case '/whoami':
      return handleWhoami(context);

    case '/memory':
      return { action: 'memory', handled: true };

    case '/clear':
    case '/reset':
      return handleClear(context);

    case '/compact':
      return handleCompact(context);

    case '/allow':
      return handleAllow(command, context);

    case '/exit':
    case '/quit':
    case '/bye':
      return handleExit(context);

    default:
      return {
        response: formatMessage(
          `Unknown command: ${command}\nType /help for available commands`,
          context.source,
        ),
        action: 'none',
        handled: false,
      };
  }
}

function handleHelp(command: string, context: CommandContext): CommandResult {
  const arg = command.trim().split(/\s+/)[1];

  if (arg) {
    const spec = findCommand(arg);
    if (!spec) {
      return formatCommandResult(
        `Unknown command: ${arg}\nType /help for the full list.`,
        context.source,
      );
    }

    const lines = [`*${spec.name}*`, '', `  ${spec.summary}`];
    if (spec.usage) lines.push('', `  Usage: ${spec.usage}`);
    if (spec.aliases?.length) lines.push('', `  Aliases: ${spec.aliases.join(', ')}`);
    if (spec.trusted) lines.push('', '  Restricted to trusted senders.');
    if (spec.details) lines.push('', spec.details);
    return formatCommandResult(lines.join('\n'), context.source);
  }

  const rows = listCommandsFor(context.source).map((spec) => {
    const invocation = spec.usage ?? spec.name;
    return `${invocation.padEnd(20)} ${spec.summary}`;
  });

  const message = `*Available Commands:*

${rows.join('\n')}

Send me any message to interact!`;

  return formatCommandResult(message, context.source);
}

function handleStatus(context: CommandContext): CommandResult {
  if (context.source === 'telegram') {
    return {
      response: `✅ *Bot Status*

• Connection: Active
• AI Provider: *${config.AI.MANAGER.PROVIDER}*
• Model: *${config.AI.MANAGER.MODEL}*
• Session mode: *${config.SESSION.SUMMARIZER_MODE}*`,
      action: 'none',
      handled: true,
    };
  }

  return {
    response: `Status:

  Connection:   Active
  AI Provider:  ${config.AI.MANAGER.PROVIDER}
  Model:        ${config.AI.MANAGER.MODEL}
  Base URL:     ${config.AI.MANAGER.BASE_URL}
  Session mode: ${config.SESSION.SUMMARIZER_MODE}`,
    action: 'none',
    handled: true,
  };
}

function handleWhoami(context: CommandContext): CommandResult {
  const access = context.trusted
    ? 'trusted — tools and learned skills enabled'
    : 'standard — chat only, tools disabled';

  const lines = [
    '*Who you are to me*',
    '',
    `  Channel: ${context.source}`,
    `  Access:  ${access}`,
  ];
  if (context.originId) lines.push(`  ID:      ${context.originId}`);

  return formatCommandResult(lines.join('\n'), context.source);
}

function handleClear(context: CommandContext): CommandResult {
  const response = context.source === 'telegram'
    ? '🗑️ Cleared. Starting a fresh session.'
    : 'Cleared. Starting a fresh session.';

  return { response, action: 'clear', handled: true };
}

function handleCompact(context: CommandContext): CommandResult {
  const response = context.source === 'telegram'
    ? '🗜️ Compacting session — starting a fresh one with a summary of what we covered.'
    : 'Compacting session — starting a fresh one with a summary of what we covered.';

  return { response, action: 'compact', handled: true };
}

function handleAllow(command: string, context: CommandContext): CommandResult {
  const domain = command.trim().split(/\s+/)[1] ?? '';

  if (!context.trusted) {
    return formatCommandResult('Only trusted senders can change allowed_domains.', context.source);
  }

  if (!domain) {
    return formatCommandResult(
      'Usage: /allow <domain> — adds a domain to allowed_domains in koris.json so I can reach it.',
      context.source,
    );
  }

  const result = addAllowedDomain(domain);
  if (!result.ok) {
    return formatCommandResult(result.error, context.source);
  }

  const message = result.added
    ? `Added ${result.hostname} to allowed_domains. I can reach it now.`
    : `${result.hostname} is already in allowed_domains.`;
  return formatCommandResult(message, context.source);
}

function handleExit(context: CommandContext): CommandResult {
  const response = context.source === 'telegram'
    ? 'This bot stays running. Use /clear to start a fresh session.'
    : 'To leave koris, press Ctrl+C. Use /clear to start a fresh session.';

  return { response: formatMessage(response, context.source), action: 'none', handled: true };
}

function formatMessage(message: string, channel: string): string {
  // Telegram uses Markdown, TUI uses plain text
  if (channel === 'telegram') {
    return message;
  }
  return message.replace(/\*/g, '');
}

function formatCommandResult(message: string, channel: string): CommandResult {
  return {
    response: formatMessage(message, channel),
    action: 'none',
    handled: true,
  };
}

/**
 * Whether a message names a command koris handles. Matches the known command
 * set (canonical names and aliases) rather than a bare leading slash, so an
 * unrecognised `/something` flows to the agent like any other message.
 */
export function isCommand(message: string): boolean {
  return isKnownCommand(message);
}

/**
 * Flat list of command tokens (canonical names + aliases) listable on a
 * channel, for input completion.
 */
export function getAvailableCommands(channel: string): string[] {
  return listCommandsFor(channel).flatMap((spec) => [spec.name, ...(spec.aliases ?? [])]);
}
