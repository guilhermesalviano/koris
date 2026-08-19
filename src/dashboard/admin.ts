import express, { type Request, type Response, type Router } from 'express';
import { config } from '../config';
import { ILogger } from '../infrastructure/logger';
import { IDatabaseService } from '../infrastructure/db-sqlite';
import { healthCheck } from '../services/provider-health-service';
import { SessionRepositoryFactory } from '../repositories/session';
import { MessageRepositoryFactory } from '../repositories/message';
import { MemoryRepositoryFactory } from '../repositories/memory';
import { HeartbeatRepositoryFactory } from '../repositories/heartbeat';
import { ChannelRepositoryFactory } from '../repositories/channel';
import { CHANNEL_TYPES, ChannelType } from '../entities/channel';
import { LearnedSkillsRepositoryFactory } from '../repositories/learned-skills';
import { SkillsRepositoryFactory } from '../repositories/skills';
import { SkillSyncSingleton } from '../services/skills/skill-sync';
import { AuditLogRepositoryFactory, AuditLogRow } from '../repositories/audit-log';
import { buildUsageReport, usageFrom } from '../services/usage/usage';
import { Heartbeat } from '../entities/heartbeat';
import { AuditStatus, AuditType } from '../entities/audit-log';
import { Session } from '../entities/session';
import { BEAT_TYPES, BeatType } from '../types/beat';
import { HeartbeatSingleton } from '../services/agents/sub-agents/heartbeat/runner';
import { hasSpecificHour, isEveryMinute, isValidCronExpression, nextCronFire } from '../utils/heartbeat';
import { formatISO } from '../utils/date';
import { activeRunsRegistry } from './active-runs';
import { sharedSerialQueue } from '../services/providers/serial-queue';
import { subAgentQueuesRegistry } from '../services/sub-agents-queue/sub-agent-queue-registry';

const MASKED_KEYS = new Set(['BOT_TOKEN', 'API_TOKEN', 'SERPAPI_KEY', 'SEARCH_API_KEY']);

function maskDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => maskDeep(item));
  }

  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = MASKED_KEYS.has(key) && typeof val === 'string' && val
        ? maskSecret(val)
        : maskDeep(val);
    }
    return out;
  }

  return value;
}

function maskSecret(value: string): string {
  if (value.length <= 4) return '••••';
  return `${value.slice(0, 2)}••••${value.slice(-2)}`;
}

function parsePagination(req: Request): { limit: number; offset: number } {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  return { limit, offset };
}

function previewText(value: string | null, maxLength = 120): string | null {
  if (!value) return null;
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}

function toAuditJson(row: AuditLogRow) {
  return {
    id: row.id,
    runId: row.run_id,
    sessionId: row.session_id,
    channel: row.channel,
    type: row.type,
    role: row.role,
    agentName: row.agent_name,
    provider: row.provider,
    model: row.model,
    prompt: row.prompt,
    promptPreview: previewText(row.prompt ?? null),
    promptLength: row.prompt_length,
    response: row.response,
    responsePreview: previewText(row.response ?? null),
    responseLength: row.response_length,
    finishReason: row.finish_reason,
    toolCalls: row.tool_calls,
    toolsEnabled: row.tools_enabled == null ? undefined : row.tools_enabled === 1,
    toolName: row.tool_name,
    toolArgs: row.tool_args,
    success: row.success == null ? undefined : row.success === 1,
    durationMs: row.duration_ms,
    status: row.status,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

class AdminRouterFactory {
  static create(logger: ILogger, db: IDatabaseService): Router {
    const router = express.Router();

    const sessionRepo = SessionRepositoryFactory.create(db);
    const messageRepo = MessageRepositoryFactory.create(db);
    const memoryRepo = MemoryRepositoryFactory.create(db);
    const heartbeatRepo = HeartbeatRepositoryFactory.create(db);
    const channelRepo = ChannelRepositoryFactory.create(db);
    const learnedSkillsRepo = LearnedSkillsRepositoryFactory.create(db);
    const skillsRepo = SkillsRepositoryFactory.create(logger);
    const auditRepo = AuditLogRepositoryFactory.create(db);

    router.get('/overview', async (_req: Request, res: Response) => {
      const health = await healthCheck(logger);

      const beats = heartbeatRepo.getAll();
      const lastHeartbeatRunAt = beats.reduce<Date | null>((latest, beat) => {
        const run = beat.lastRun ?? null;
        if (!latest || (run && run.getTime() > latest.getTime())) return run;
        return latest;
      }, null);

      const registeredChannels = channelRepo.getAll().map((channel) => ({
        type: channel.channel,
        target: channel.target,
        principal: channel.isPrincipal,
      }));

      const enabledChannels: { type: ChannelType; enabled: boolean }[] = [
        { type: 'telegram', enabled: config.CHANNELS.TELEGRAM.ENABLED },
        { type: 'whatsapp', enabled: config.CHANNELS.WHATSAPP.ENABLED },
      ];

      const recentErrors = auditRepo.findAll({
        limit: 5,
        filters: { status: 'error' },
      }).map(toAuditJson);

      res.json({
        sessions: sessionRepo.count(),
        openSessions: sessionRepo.countOpen(),
        messages: messageRepo.count(),
        memories: memoryRepo.count(),
        heartbeats: beats.length,
        learnedSkills: learnedSkillsRepo.count(),
        learnedSkillsLimit: config.LEARNED_SKILLS_LIMIT,
        skills: skillsRepo.get().length,
        auditErrors: auditRepo.count({ status: 'error' }),
        provider: config.AI.MANAGER.PROVIDER,
        model: config.AI.MANAGER.MODEL,
        workerProvider: config.AI.WORKERS.PROVIDER,
        workerModel: config.AI.WORKERS.MODEL,
        environment: config.ENVIRONMENT,
        timezone: config.TIMEZONE,
        heartbeatEnabled: config.HEARTBEAT,
        summarizerEnabled: config.AI.SUMMARIZER,
        aiParallel: config.AI.PARALLEL,
        aiSubagentsParallel: config.AI.SUBAGENTS_PARALLEL,
        channels: enabledChannels,
        registeredChannels,
        lastHeartbeatRunAt: lastHeartbeatRunAt ? formatISO(lastHeartbeatRunAt) : null,
        health: { status: health.status, details: health.details },
        activeRuns: activeRunsRegistry.list(),
        queue: {
          parallel: config.AI.PARALLEL,
          subagentsParallel: config.AI.SUBAGENTS_PARALLEL,
          backgroundGraceMs: config.AI.BACKGROUND_GRACE_MS,
          subAgents: subAgentQueuesRegistry.getSnapshot(),
          ...sharedSerialQueue.snapshot(),
        },
        usage: buildUsageReport(auditRepo.usage({ from: usageFrom(7) }), 7).total,
        recentErrors,
      });
    });

    router.get('/sessions', (req: Request, res: Response) => {
      const { limit, offset } = parsePagination(req);
      const sessions = sessionRepo.findAll(limit, offset);
      res.json({
        total: sessionRepo.count(),
        limit,
        offset,
        items: sessions.map((session) => ({
          id: session.id,
          entryChannel: session.entryChannel,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          messageCount: session.messageCount,
          preview: previewText(messageRepo.getPreviewBySessionId(session.id)),
          metadata: session.metadata,
        })),
      });
    });

    router.post('/sessions', (_req: Request, res: Response) => {
      const session = new Session({ entryChannel: 'web' });
      sessionRepo.save(session);
      res.status(201).json({
        id: session.id,
        entryChannel: session.entryChannel,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        messageCount: session.messageCount,
        metadata: session.metadata,
      });
    });

    router.get('/sessions/:id', (req: Request, res: Response) => {
      const session = sessionRepo.findById(String(req.params.id));
      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      const messages = messageRepo.getBySessionId(session.id, 200);
      const memories = memoryRepo.getBySessionId(session.id);

      res.json({
        session: {
          id: session.id,
          entryChannel: session.entryChannel,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          messageCount: session.messageCount,
          metadata: session.metadata,
        },
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          images: m.images,
          missingImages: m.missingImages,
          createdAt: m.createdAt,
        })),
        memories: memories.map((m) => ({
          id: m.id,
          type: m.type,
          content: m.content,
          importance: m.importance,
          tags: m.tags,
          createdAt: m.createdAt,
        })),
      });
    });

    router.delete('/sessions/:id', (req: Request, res: Response) => {
      if (!sessionRepo.findById(String(req.params.id))) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      sessionRepo.deleteById(String(req.params.id));
      res.json({ success: true });
    });

    router.get('/memories', (req: Request, res: Response) => {
      const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;
      const memories = sessionId ? memoryRepo.getBySessionId(sessionId) : memoryRepo.getAll();

      res.json({
        items: memories.map((m) => ({
          id: m.id,
          sessionId: m.sessionId,
          source: m.source,
          type: m.type,
          content: m.content,
          importance: m.importance,
          tags: m.tags,
          createdAt: m.createdAt,
        })),
      });
    });

    router.delete('/memories/:id', (req: Request, res: Response) => {
      memoryRepo.deleteById(String(req.params.id));
      res.json({ success: true });
    });

    router.get('/active', (_req: Request, res: Response) => {
      res.json({ items: activeRunsRegistry.list() });
    });

    router.get('/queue', (_req: Request, res: Response) => {
      res.json({
        parallel: config.AI.PARALLEL,
        subagentsParallel: config.AI.SUBAGENTS_PARALLEL,
        backgroundGraceMs: config.AI.BACKGROUND_GRACE_MS,
        subAgents: subAgentQueuesRegistry.getSnapshot(),
        ...sharedSerialQueue.snapshot(),
      });
    });

    router.get('/audit', (req: Request, res: Response) => {
      const { limit, offset } = parsePagination(req);
      const filters: {
        type?: AuditType;
        sessionId?: string;
        role?: 'manager' | 'worker';
        status?: AuditStatus;
        agentName?: string;
      } = {
        type: typeof req.query.type === 'string' ? (req.query.type as AuditType) : undefined,
        sessionId: typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined,
        role: typeof req.query.role === 'string' ? (req.query.role as 'manager' | 'worker') : undefined,
        status: typeof req.query.status === 'string' ? (req.query.status as AuditStatus) : undefined,
        agentName: typeof req.query.agentName === 'string' ? req.query.agentName : undefined,
      };

      res.json({
        total: auditRepo.count(filters),
        limit,
        offset,
        items: auditRepo.findAll({ limit, offset, filters }).map(toAuditJson),
      });
    });

    router.get('/audit/:id', (req: Request, res: Response) => {
      const row = auditRepo.findById(String(req.params.id));
      if (!row) {
        res.status(404).json({ error: 'Audit entry not found' });
        return;
      }
      res.json(toAuditJson(row));
    });

    router.delete('/audit/:id', (req: Request, res: Response) => {
      const deleted = auditRepo.deleteById(String(req.params.id));
      if (!deleted) {
        res.status(404).json({ error: 'Audit entry not found' });
        return;
      }
      res.json({ success: true });
    });

    router.delete('/audit', (_req: Request, res: Response) => {
      res.json({ success: true, deleted: auditRepo.deleteAll() });
    });

    router.get('/usage', (req: Request, res: Response) => {
      const rawDays = req.query.days;
      let days: number | null = null;

      if (typeof rawDays === 'string' && rawDays !== '') {
        const parsed = Number.parseInt(rawDays, 10);
        if (!Number.isNaN(parsed) && parsed >= 0) {
          days = parsed;
        }
      }

      const rows = auditRepo.usage({ from: usageFrom(days) });
      res.json(buildUsageReport(rows, days));
    });

    router.get('/chat/history', (_req: Request, res: Response) => {
      const session = sessionRepo.findLatestOpenByEntryChannel('web');
      if (!session) {
        res.json({ sessionId: null, messages: [] });
        return;
      }

      const messages = messageRepo.getBySessionId(session.id, 200);
      res.json({
        sessionId: session.id,
        messages: messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          images: m.images,
          missingImages: m.missingImages,
          createdAt: m.createdAt,
        })),
      });
    });

    router.get('/heartbeats', (_req: Request, res: Response) => {
      const now = new Date();
      res.json({
        items: heartbeatRepo.getAll().map((beat) => {
          const since = beat.lastRun ?? beat.createdAt;
          const from = since > now ? since : now;
          const next = nextCronFire(beat.cronExpression, from);
          return {
            id: beat.id,
            beat: beat.beat,
            type: beat.type,
            cron_expression: beat.cronExpression,
            channel: beat.channel ?? null,
            target: beat.target ?? null,
            last_run: beat.lastRun ? formatISO(beat.lastRun) : null,
            created_at: formatISO(beat.createdAt),
            next_run: next ? formatISO(next) : null,
          };
        }),
      });
    });

    router.get('/channels', (_req: Request, res: Response) => {
      res.json({ items: channelRepo.getAll() });
    });

    router.patch('/channels/:id/principal', (req: Request, res: Response) => {
      const updated = channelRepo.setPrincipal(String(req.params.id));
      if (!updated) {
        res.status(404).json({ error: 'Channel not found' });
        return;
      }

      res.json(updated);
    });

    router.post('/heartbeats', (req: Request, res: Response) => {
      const { beat, type = 'reminder', cronExpression, channel, target } = req.body ?? {};

      if (typeof beat !== 'string' || !beat.trim()) {
        res.status(400).json({ error: 'beat is required' });
        return;
      }

      if (typeof cronExpression !== 'string' || !isValidCronExpression(cronExpression)) {
        res.status(400).json({ error: 'Invalid cron_expression. Expected 5-field standard cron format.' });
        return;
      }

      if (!BEAT_TYPES.includes(type)) {
        res.status(400).json({ error: `Invalid type. Must be one of: ${BEAT_TYPES.join(', ')}.` });
        return;
      }

      if (channel !== undefined && !CHANNEL_TYPES.includes(channel)) {
        res.status(400).json({ error: `Invalid channel. Must be one of: ${CHANNEL_TYPES.join(', ')}.` });
        return;
      }

      if ((channel !== undefined && !target) || (channel === undefined && target !== undefined)) {
        res.status(400).json({ error: 'channel and target must be provided together.' });
        return;
      }

      if (isEveryMinute(cronExpression)) {
        res.status(400).json({ error: 'Beats that run every minute are not allowed.' });
        return;
      }

      if (!hasSpecificHour(cronExpression)) {
        res.status(400).json({ error: 'A specific hour must be provided.' });
        return;
      }

      const heartbeat = new Heartbeat({
        beat: beat.trim(),
        type: type as BeatType,
        cronExpression: cronExpression.trim(),
        channel: channel as ChannelType | undefined,
        target: target as string | undefined,
      });
      heartbeatRepo.save(heartbeat);
      HeartbeatSingleton.getExistingInstance()?.reschedule();

      res.status(201).json(heartbeat);
    });

    router.patch('/heartbeats/:id', (req: Request, res: Response) => {
      if (!heartbeatRepo.getById(String(req.params.id))) {
        res.status(404).json({ error: 'Heartbeat not found' });
        return;
      }

      const { beat, type, cronExpression, channel, target } = req.body ?? {};

      if (cronExpression !== undefined && !isValidCronExpression(cronExpression)) {
        res.status(400).json({ error: 'Invalid cron_expression.' });
        return;
      }

      if (type !== undefined && !BEAT_TYPES.includes(type)) {
        res.status(400).json({ error: `Invalid type. Must be one of: ${BEAT_TYPES.join(', ')}.` });
        return;
      }

      if (channel !== undefined && channel !== null && !CHANNEL_TYPES.includes(channel)) {
        res.status(400).json({ error: `Invalid channel. Must be one of: ${CHANNEL_TYPES.join(', ')}.` });
        return;
      }

      if ((channel !== undefined && channel !== null && !target) || ((channel === undefined || channel === null) && target !== undefined)) {
        res.status(400).json({ error: 'channel and target must be provided together.' });
        return;
      }

      const updated = heartbeatRepo.update(String(req.params.id), {
        beat,
        type,
        cronExpression: typeof cronExpression === 'string' ? cronExpression.trim() : cronExpression,
        channel: channel === undefined ? undefined : channel,
        target: target === undefined ? undefined : target,
      });
      HeartbeatSingleton.getExistingInstance()?.reschedule();

      res.json(updated);
    });

    router.delete('/heartbeats/:id', (req: Request, res: Response) => {
      const deleted = heartbeatRepo.deleteById(String(req.params.id));
      if (!deleted) {
        res.status(404).json({ error: 'Heartbeat not found' });
        return;
      }

      HeartbeatSingleton.getExistingInstance()?.reschedule();
      res.json({ success: true });
    });

    router.get('/skills', (_req: Request, res: Response) => {
      const learnedByName = new Map(learnedSkillsRepo.getAll().map(skill => [skill.name, skill]));

      const items = skillsRepo.get().map((skill) => {
        const learned = learnedByName.get(skill.name);
        return {
          name: skill.name,
          description: skill.description,
          read_when: skill.read_when ?? null,
          content: skill.content ?? null,
          enabled: learned ? learned.enabled : true,
          learned_at: learned ? learned.learned_at : null,
        };
      });

      res.json({ items, limit: config.LEARNED_SKILLS_LIMIT });
    });

    router.patch('/skills/:name', (req: Request, res: Response) => {
      const enabled = req.body?.enabled;
      if (typeof enabled !== 'boolean') {
        res.status(400).json({ error: 'enabled must be a boolean' });
        return;
      }

      const updated = learnedSkillsRepo.setEnabled(String(req.params.name), enabled);
      if (!updated) {
        res.status(404).json({ error: 'Skill not found' });
        return;
      }

      res.json({ success: true, skill: learnedSkillsRepo.getByName(String(req.params.name)) });
    });

    router.post('/skills/sync', (_req: Request, res: Response) => {
      const sync = SkillSyncSingleton.getExistingInstance();
      if (!sync) {
        res.status(503).json({ error: 'Skill sync not initialized' });
        return;
      }

      sync.sync();
      res.json({ success: true });
    });

    router.get('/settings', (_req: Request, res: Response) => {
      res.json(maskDeep(config));
    });

    router.get('/health', async (_req: Request, res: Response) => {
      const result = await healthCheck(logger);
      res.status(result.status === 'ok' ? 200 : 500).json(result);
    });

    return router;
  }
}

export { AdminRouterFactory };
