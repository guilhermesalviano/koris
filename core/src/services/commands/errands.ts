import { DatabaseServiceFactory, IDatabaseService } from '../../infrastructure/db-sqlite';
import { LoggerFactory } from '../../infrastructure/logger';
import { SessionManager } from '../session-manager';
import { buildErrandService, IErrandService } from '../errands';
import { ErrandRepositoryFactory } from '../../repositories/errand';
import { CHANNEL_TYPES } from '../../entities/channel';
import { formatCommandResult } from './format';
import type { CommandContext, CommandResult } from '../../types/commands';
import type { Errand } from '../../entities/errand';

// Everything after "with <peer> on <channel>": goal may contain spaces, so
// the keywords anchor from the end of the string.
const CREATE_PATTERN = /^(.+?)\s+with\s+(\S+)\s+on\s+(\S+)$/i;

function resolveErrandService(logger = LoggerFactory.create()): { db: IDatabaseService; errandService: IErrandService } | null {
  const db = DatabaseServiceFactory.create();
  const sessionManager = new SessionManager(db);
  const errandService = buildErrandService(logger, db, sessionManager);
  return errandService ? { db, errandService } : null;
}

function formatErrand(errand: Errand, db: IDatabaseService): string {
  const targets = ErrandRepositoryFactory.create(db).findTargets(errand.id);
  const lines = [
    `[${errand.id}] ${errand.state} — ${errand.goal}`,
    `  targets: ${targets.length}`,
  ];
  if (errand.notes) lines.push(`  notes: ${errand.notes}`);
  if (errand.result) lines.push(`  result: ${errand.result}`);
  return lines.join('\n');
}

function listErrands(context: CommandContext): CommandResult {
  const resolved = resolveErrandService();
  if (!resolved) {
    return formatCommandResult('Errands are not available: no channel manager is running.', context.source);
  }

  const { db, errandService } = resolved;
  const errands = context.sessionId
    ? errandService.listByOrigin(context.sessionId)
    : errandService.listAll();

  if (errands.length === 0) {
    return formatCommandResult('No errands yet. Usage: /errand <goal> with <contact> on <channel>', context.source);
  }

  return formatCommandResult(errands.map((errand) => formatErrand(errand, db)).join('\n\n'), context.source);
}

function createErrand(rest: string, context: CommandContext): CommandResult {
  const match = rest.match(CREATE_PATTERN);
  if (!match) {
    return formatCommandResult('Usage: /errand <goal> with <contact> on <channel>', context.source);
  }

  const [, goal, peerId, channel] = match;
  if (!(CHANNEL_TYPES as readonly string[]).includes(channel.toLowerCase())) {
    return formatCommandResult(`Unknown channel "${channel}". Must be one of: ${CHANNEL_TYPES.join(', ')}.`, context.source);
  }

  if (!context.sessionId) {
    return formatCommandResult('Cannot start an errand: no session to attribute it to.', context.source);
  }

  const resolved = resolveErrandService();
  if (!resolved) {
    return formatCommandResult('Errands are not available: no channel manager is running.', context.source);
  }

  try {
    const errand = resolved.errandService.create(
      goal.trim(),
      [{ channel: channel.toLowerCase(), peerId }],
      context.sessionId,
      goal.trim(),
    );
    const staged = errand.state === 'draft'
      ? `Staged as a draft — approve with \`/errand approve ${errand.id}\` before it sends.`
      : `Queued behind an existing errand with that contact — it will start once the other one closes.`;
    return formatCommandResult(`Errand [${errand.id}] created: "${errand.goal}".\n${staged}`, context.source);
  } catch (err) {
    return formatCommandResult(err instanceof Error ? err.message : String(err), context.source);
  }
}

function runAction(
  context: CommandContext,
  id: string,
  verb: string,
  apply: (errandService: IErrandService, id: string) => Errand,
): CommandResult {
  if (!id) {
    return formatCommandResult(`Usage: /errand ${verb} <id>`, context.source);
  }

  const resolved = resolveErrandService();
  if (!resolved) {
    return formatCommandResult('Errands are not available: no channel manager is running.', context.source);
  }

  try {
    const errand = apply(resolved.errandService, id);
    return formatCommandResult(`Errand [${errand.id}] is now "${errand.state}".`, context.source);
  } catch (err) {
    return formatCommandResult(err instanceof Error ? err.message : String(err), context.source);
  }
}

/**
 * `/errand` — delegated-conversation management, trusted senders only:
 * - `/errand` — list errands originating from this session
 * - `/errand <goal> with <contact> on <channel>` — create one (staged as a draft)
 * - `/errand approve <id>` — send the staged opener
 * - `/errand close <id>` — mark it resolved
 * - `/errand cancel <id>` — cancel it
 */
export function handleErrandCommand(command: string, context: CommandContext): CommandResult {
  if (!context.trusted) {
    return formatCommandResult('Only trusted senders can manage errands.', context.source);
  }

  const rest = command.trim().replace(/^\/errand\b/i, '').trim();

  if (!rest) {
    return listErrands(context);
  }

  const [subRaw, ...restParts] = rest.split(/\s+/);
  const sub = subRaw.toLowerCase();
  const arg = restParts.join(' ').trim();

  if (sub === 'approve') {
    return runAction(context, arg, 'approve', (svc, id) => svc.approve(id));
  }
  if (sub === 'close') {
    return runAction(context, arg, 'close', (svc, id) => svc.resolve(id, 'Closed by the principal.'));
  }
  if (sub === 'cancel') {
    return runAction(context, arg, 'cancel', (svc, id) => svc.cancel(id));
  }

  return createErrand(rest, context);
}
