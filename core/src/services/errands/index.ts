import { ILogger } from '../../infrastructure/logger';
import { IDatabaseService } from '../../infrastructure/db-sqlite';
import { config } from '../../config';
import { Errand, ErrandProps } from '../../entities/errand';
import { IErrandRepository, ErrandRepositoryFactory } from '../../repositories/errand';
import { ISessionRepository, SessionRepositoryFactory } from '../../repositories/session';
import { ISessionManager } from '../session-manager';
import { IOutboundMessageService, OutboundMessageServiceFactory } from '../outbound/message-service';
import { MessageServiceFactory } from '../message-service';
import { ChannelsSingleton } from '../../channels';
import { CHANNEL_TYPES } from '../../entities/channel';
import { nowISO } from '../../utils/date';
import { ErrandState, ERRAND_OPEN_STATES } from '../../types/errand';

const ACTIVE_STATES: ErrandState[] = ['draft', 'open', 'awaiting_peer', 'awaiting_principal'];
const NON_TERMINAL_STATES: ErrandState[] = ['draft', 'queued', 'open', 'awaiting_peer', 'awaiting_principal'];

export interface ErrandTargetRef {
  channel: string;
  peerId: string;
}

function isDeliverableChannel(channel: string): boolean {
  return (CHANNEL_TYPES as readonly string[]).includes(channel);
}

interface IErrandService {
  create(goal: string, targets: ErrandTargetRef[], originSessionId: string, openingMessage: string): Errand;
  approve(id: string): Errand;
  recordPeerReply(id: string, notes?: string): Errand;
  escalate(id: string, question: string, notes?: string): Errand;
  resolve(id: string, result: string, notes?: string): Errand;
  fail(id: string, reason: string, notes?: string): Errand;
  cancel(id: string): Errand;
  hydrate(errand: Errand): Errand;
  get(id: string): Errand | null;
  listByOrigin(originSessionId: string): Errand[];
  listAll(state?: ErrandState, limit?: number, offset?: number): Errand[];
  findActiveForPeer(channel: string, peerId: string): { errand: Errand; sessionId: string } | null;
}

class ErrandService implements IErrandService {
  constructor(
    private db: IDatabaseService,
    private errandRepository: IErrandRepository,
    private sessionRepository: ISessionRepository,
    private sessionManager: ISessionManager,
    private outboundMessageService: IOutboundMessageService,
    private logger: ILogger,
    private now: () => Date = () => new Date(),
  ) {}

  create(goal: string, targets: ErrandTargetRef[], originSessionId: string, openingMessage: string): Errand {
    if (targets.length === 0) {
      throw new Error('An errand needs at least one target.');
    }

    const openCount = NON_TERMINAL_STATES.reduce((sum, state) => sum + this.errandRepository.countByState(state), 0);
    if (openCount >= config.ERRANDS.MAX_CONCURRENT) {
      throw new Error(`Too many errands in flight (max ${config.ERRANDS.MAX_CONCURRENT}). Close one before starting another.`);
    }

    return this.db.transaction(() => {
      const targetSessionIds = targets.map((target) => this.sessionManager
        .getSessionService({ channel: target.channel, peerId: target.peerId, kind: 'delegated' })
        .getSession().id);

      const blocked = targetSessionIds.some((sessionId) => this.errandRepository.findActiveBySessionId(sessionId));
      const state: ErrandState = blocked ? 'queued' : 'draft';

      const errand = new Errand({ goal, state, originSessionId, pendingMessage: openingMessage });
      this.errandRepository.save(errand);
      for (const sessionId of targetSessionIds) {
        this.errandRepository.addTarget(errand.id, sessionId);
      }

      return errand;
    });
  }

  approve(id: string): Errand {
    const errand = this.mustFind(id);
    if (errand.state !== 'draft') {
      throw new Error(`Errand ${id} is not awaiting approval (state=${errand.state}).`);
    }

    const message = errand.pendingMessage ?? '';
    for (const sessionId of this.errandRepository.findTargets(id)) {
      this.pushToSession(sessionId, message);
    }

    return this.transition(errand, { state: 'awaiting_peer', pendingMessage: undefined, lastProgressAt: nowISO() });
  }

  recordPeerReply(id: string, notes?: string): Errand {
    const errand = this.mustFind(id);
    return this.transition(errand, {
      state: 'awaiting_peer',
      notes: notes ?? errand.notes,
      lastProgressAt: nowISO(),
    });
  }

  escalate(id: string, question: string, notes?: string): Errand {
    const errand = this.mustFind(id);
    const updated = this.transition(errand, {
      state: 'awaiting_principal',
      notes: notes ?? errand.notes,
      lastProgressAt: nowISO(),
    });
    this.pushToSession(errand.originSessionId, `❓ Errand "${errand.goal}" needs your input: ${question}`);
    return updated;
  }

  resolve(id: string, result: string, notes?: string): Errand {
    const errand = this.mustFind(id);
    return this.close(errand, 'resolved', result, notes, `✅ Errand "${errand.goal}" resolved: ${result}`);
  }

  fail(id: string, reason: string, notes?: string): Errand {
    const errand = this.mustFind(id);
    return this.close(errand, 'failed', reason, notes, `⚠️ Errand "${errand.goal}" failed: ${reason}`);
  }

  cancel(id: string): Errand {
    const errand = this.mustFind(id);
    return this.close(errand, 'cancelled', undefined, undefined);
  }

  // Lazy expiry: an in-flight errand that has gone quiet past the hard
  // expiry is flipped to `expired` the moment it's next read — no scheduler
  // needed. Every read path (`get`/`listByOrigin`/`listAll`) routes through here.
  hydrate(errand: Errand): Errand {
    if (!ERRAND_OPEN_STATES.includes(errand.state)) {
      return errand;
    }

    const reference = errand.lastProgressAt ?? errand.createdAt;
    const ageMs = this.now().getTime() - new Date(reference).getTime();
    if (ageMs <= config.ERRANDS.HARD_EXPIRY_MS) {
      return errand;
    }

    const closedAt = nowISO();
    this.errandRepository.update(errand.id, { state: 'expired', closedAt });
    return new Errand({ ...errand, state: 'expired', closedAt });
  }

  get(id: string): Errand | null {
    const errand = this.errandRepository.findById(id);
    return errand ? this.hydrate(errand) : null;
  }

  listByOrigin(originSessionId: string): Errand[] {
    return this.errandRepository.findByOriginSessionId(originSessionId).map((errand) => this.hydrate(errand));
  }

  listAll(state?: ErrandState, limit?: number, offset?: number): Errand[] {
    return this.errandRepository.findAll(state, limit, offset).map((errand) => this.hydrate(errand));
  }

  findActiveForPeer(channel: string, peerId: string): { errand: Errand; sessionId: string } | null {
    const session = this.sessionRepository.findLatestOpen({ channel, peerId, kind: 'delegated' });
    if (!session) return null;

    const active = this.errandRepository.findActiveBySessionId(session.id);
    if (!active) return null;

    const hydrated = this.hydrate(active);
    if (!ACTIVE_STATES.includes(hydrated.state)) return null;

    return { errand: hydrated, sessionId: session.id };
  }

  private close(errand: Errand, state: ErrandState, result: string | undefined, notes: string | undefined, notice?: string): Errand {
    const closedAt = nowISO();
    const updated = this.transition(errand, {
      state,
      result,
      notes: notes ?? errand.notes,
      closedAt,
      lastProgressAt: closedAt,
    });
    this.promoteQueued(this.errandRepository.findTargets(errand.id));
    if (notice) {
      this.pushToSession(errand.originSessionId, notice);
    }
    return updated;
  }

  // A closing errand may free up a target session another errand was
  // queued behind. Promote the oldest queued errand for that session back
  // to `draft` — but only once every one of ITS targets is free, so the
  // one-active-per-session invariant never breaks.
  private promoteQueued(sessionIds: string[]): void {
    const promoted = new Set<string>();
    for (const sessionId of sessionIds) {
      const next = this.errandRepository.findNextQueuedBySessionId(sessionId);
      if (!next || promoted.has(next.id)) continue;

      const stillBlocked = this.errandRepository
        .findTargets(next.id)
        .some((targetSessionId) => this.errandRepository.findActiveBySessionId(targetSessionId));

      if (!stillBlocked) {
        this.errandRepository.update(next.id, { state: 'draft' });
        promoted.add(next.id);
      }
    }
  }

  private pushToSession(sessionId: string, content: string): void {
    const session = this.sessionRepository.findById(sessionId);
    if (!session) {
      this.logger.warn(`Errand push target session not found: ${sessionId}`);
      return;
    }

    if (isDeliverableChannel(session.channel)) {
      void this.outboundMessageService.send({
        channel: session.channel,
        target: session.peerId,
        content,
        kind: session.kind,
      });
      return;
    }

    // web/tui: nothing to deliver to, just record it in the transcript.
    const sessionService = this.sessionManager.getSessionServiceById(session.id);
    MessageServiceFactory.create(this.db, sessionService).save({ role: 'assistant', content });
  }

  private transition(errand: Errand, patch: Partial<ErrandProps>): Errand {
    this.errandRepository.update(errand.id, patch);
    return new Errand({ ...errand, ...patch });
  }

  private mustFind(id: string): Errand {
    const errand = this.errandRepository.findById(id);
    if (!errand) {
      throw new Error(`Errand not found: ${id}`);
    }
    return errand;
  }
}

class ErrandServiceFactory {
  static create(
    logger: ILogger,
    db: IDatabaseService,
    sessionManager: ISessionManager,
    outboundMessageService: IOutboundMessageService,
    now?: () => Date,
  ): ErrandService {
    return new ErrandService(
      db,
      ErrandRepositoryFactory.create(db),
      SessionRepositoryFactory.create(db),
      sessionManager,
      outboundMessageService,
      logger,
      now,
    );
  }
}

// Shared runtime constructor for the two call sites that need an
// ErrandService outside of a request/boot chain that already threads one
// through (the admin API and the negotiator sub-agent): resolves the
// currently-running channels manager lazily, since it may not exist yet at
// boot time (e.g. MessageGatewayFactory.create runs before ChannelsSingleton
// is instantiated). Returns null when no channel manager is running.
function buildErrandService(
  logger: ILogger,
  db: IDatabaseService,
  sessionManager: ISessionManager,
): ErrandService | null {
  const channelsManager = ChannelsSingleton.getExistingInstance();
  if (!channelsManager) return null;
  const outboundMessageService = OutboundMessageServiceFactory.create(logger, channelsManager, db, sessionManager);
  return ErrandServiceFactory.create(logger, db, sessionManager, outboundMessageService);
}

export { IErrandService, ErrandService, ErrandServiceFactory, buildErrandService };
