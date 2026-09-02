/**
 * Single source of truth for the user-facing slash commands.
 *
 * `handleCommand` (the dispatcher), `isCommand` (recognition), `getAvailableCommands`
 * (channel completion) and the `/help` text are all derived from this list, so a
 * command is added or retired in exactly one place.
 *
 * Not to be confused with `plugins/tools/contracts.ts`'s `COMMANDS` extension
 * point, which registers the *AI agent's* tools.
 */

export type CommandChannel = 'tui' | 'web' | 'telegram' | 'whatsapp';

export interface CommandSpec {
  /** Canonical name, always slash-prefixed and lowercase, e.g. `/help`. */
  name: string;
  /** Extra names that resolve to the same handler. */
  aliases?: string[];
  /** One line shown in `/help`. Keep it free of `*` markers. */
  summary: string;
  /** Invocation shape shown in `/help`, e.g. `/usage [days|today]`. */
  usage?: string;
  /** Longer explanation shown by `/help <command>`. */
  details?: string;
  /** When set, only trusted senders may run it. */
  trusted?: boolean;
  /** Restrict listing to these channels. Omit to list everywhere. */
  channels?: CommandChannel[];
  /** Recognised and handled, but never listed. */
  hidden?: boolean;
}

export const SLASH_COMMANDS: readonly CommandSpec[] = [
  {
    name: '/help',
    summary: 'Show this help; `/help <command>` for detail on one command',
    usage: '/help [command]',
  },
  {
    name: '/status',
    summary: 'Connection, AI provider, model and session mode',
  },
  {
    name: '/usage',
    summary: 'Token-usage report from the audit log',
    usage: '/usage [days|today]',
    details:
      'Aggregates LLM calls, tool calls, tokens and wall-clock time. ' +
      '`/usage` is all-time, `/usage today` is since midnight, `/usage 7` is the last 7 days.',
  },
  {
    name: '/whoami',
    summary: 'How I see you: channel and access level',
  },
  {
    name: '/memory',
    summary: 'Show what earlier context I have summarised into this session',
  },
  {
    name: '/clear',
    aliases: ['/reset'],
    summary: 'End this session and start a fresh, empty one (no summary kept)',
    details:
      'Unlike /compact, nothing is carried forward — use it to drop the current ' +
      'thread entirely and start over.',
  },
  {
    name: '/compact',
    summary: 'Summarise this session into memory, then start a fresh one seeded with the summary',
  },
  {
    name: '/allow',
    summary: 'Add a domain to allowed_domains so I can reach it',
    usage: '/allow <domain>',
    trusted: true,
  },
  {
    name: '/exit',
    aliases: ['/quit', '/bye'],
    summary: 'How to leave the session',
    channels: ['tui'],
  },
];

const BY_NAME: ReadonlyMap<string, CommandSpec> = new Map(
  SLASH_COMMANDS.flatMap((spec) => [
    [spec.name, spec] as const,
    ...(spec.aliases ?? []).map((alias) => [alias, spec] as const),
  ]),
);

/** The bare command token of a message, lowercased (`"/Usage 7"` → `"/usage"`). */
export function commandToken(message: string): string {
  return message.trim().toLowerCase().split(/\s+/, 1)[0] ?? '';
}

/** Resolve a name or alias (with or without leading slash) to its spec. */
export function findCommand(nameOrAlias: string): CommandSpec | undefined {
  const token = nameOrAlias.trim().toLowerCase();
  return BY_NAME.get(token.startsWith('/') ? token : `/${token}`);
}

/** Whether a message names a known command (canonical or alias). */
export function isKnownCommand(message: string): boolean {
  return BY_NAME.has(commandToken(message));
}

/** Canonical specs listable on a channel, in declaration order. */
export function listCommandsFor(channel: string): CommandSpec[] {
  return SLASH_COMMANDS.filter(
    (spec) => !spec.hidden && (!spec.channels || (spec.channels as string[]).includes(channel)),
  );
}
