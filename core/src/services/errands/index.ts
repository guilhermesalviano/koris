import { ILogger } from '../../infrastructure/logger';
import { IDatabaseService } from '../../infrastructure/db-sqlite';
import { config } from '../../config';
import { Errand, ErrandProps } from '../../entities/errand';
import { Session } from '../../entities/session';
import { ErrandSessionMetadata } from '../../types/session';
import { THIRD_PARTY_CONVERSATION_CONTEXT } from '../../constants';
import { IErrandRepository, ErrandRepositoryFactory } from '../../repositories/errand';
import { ISessionRepository, SessionRepositoryFactory } from '../../repositories/session';
import { ISessionManager } from '../session-manager';
import { IOutboundMessageService, OutboundMessageServiceFactory } from '../outbound/message-service';
import { MessageServiceFactory } from '../message-service';
import { ChannelsSingleton } from '../../channels';
import { CHANNEL_TYPES } from '../../entities/channel';
import { nowISO } from '../../utils/date';
import { ErrandState, ERRAND_OPEN_STATES } from '../../types/errand';

const NEGOTIATING_STATES: ErrandState[] = ['open', 'awaiting_peer', 'awaiting_principal'];
const NON_TERMINAL_STATES: ErrandState[] = ['draft', 'queued', 'open', 'awaiting_peer', 'awaiting_principal'];

export interface ErrandTargetRef {
  channel: string;
  peerId: string;
}

function isDeliverableChannel(channel: string): boolean {
  return (CHANNEL_TYPES as readonly string[]).includes(channel);
}

// Preserve the address equivalence already supported by inbound errand lookup
// when checking contention and promoting a queued errand, too.
function peerAliases(channel: string, peerId: string): string[] {
  if (channel !== 'whatsapp') return [peerId];
  return [peerId, peerId.endsWith('@s.whatsapp.net')
    ? peerId.replace(/@s\.whatsapp\.net$/, '')
    : `${peerId}@s.whatsapp.net`];
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
  resumeWithPrincipalAnswer(id: string, answer: string): Promise<{ errand: Errand; reply: string }>;
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
      if (!this.sessionRepository.findById(originSessionId)) throw new Error(`Parent session not found: ${originSessionId}`);
      const blocked = targets.some((target) => this.errandRepository.findActiveByPeer(target.channel, peerAliases(target.channel, target.peerId)));
      const state: ErrandState = blocked ? 'queued' : 'draft';

      const errand = new Errand({ goal, state, originSessionId, pendingMessage: openingMessage });
      this.errandRepository.save(errand);
      const createdTargets = new Set<string>();
      for (const target of targets) {
        const key = JSON.stringify([target.channel, [...peerAliases(target.channel, target.peerId)].sort()]);
        if (createdTargets.has(key)) continue;
        createdTargets.add(key);
        const metadata: ErrandSessionMetadata = {
          parentSessionId: originSessionId,
          errandId: errand.id,
          instructions: THIRD_PARTY_CONVERSATION_CONTEXT,
        };
        // Insert a fresh child; never rotate the parent or reuse another
        // errand's contact transcript (even for the same channel and peer).
        const child = new Session({ channel: target.channel, peerId: target.peerId, kind: 'delegated', metadata });
        this.sessionRepository.save(child);
        this.errandRepository.addTarget(errand.id, child.id);
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
      pendingMessage: question,
      notes: notes ?? errand.notes,
      lastProgressAt: nowISO(),
    });
    this.pushToSession(
      errand.originSessionId,
      `❓ Errand "${errand.goal}" needs your input: ${question}\n\nReply with: \`/errand reply ${errand.id} <your answer>\``,
    );
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

  async resumeWithPrincipalAnswer(id: string, answer: string): Promise<{ errand: Errand; reply: string }> {
    const errand = this.mustFind(id);
    if (errand.state !== 'awaiting_principal') {
      throw new Error(`Errand ${id} is not awaiting your input (state=${errand.state}).`);
    }

    const targetSessionIds = this.errandRepository.findTargets(id);
    if (targetSessionIds.length === 0) {
      throw new Error(`Errand ${id} has no target sessions.`);
    }

    const targetSession = this.sessionRepository.findById(targetSessionIds[0]);
    const targetSessionService = this.sessionManager.getSessionServiceById(targetSessionIds[0]);
    const messageHistory = MessageServiceFactory.create(this.db, targetSessionService).getHistory();

    const { NegotiatorFactory } = await import('../agents/sub-agents/negotiator/sub-agent');
    const negotiator = NegotiatorFactory.create(this.logger, this.db, this.sessionManager);
    const reply = await negotiator.composeResume({
      errandId: errand.id,
      goal: errand.goal,
      notes: errand.notes,
      answer,
      question: errand.pendingMessage,
      channel: targetSession?.channel ?? 'unknown',
      sessionId: targetSessionIds[0],
      messageHistory,
    });

    const latest = this.mustFind(id);
    if (latest.state !== 'awaiting_principal' || latest.pendingMessage !== errand.pendingMessage) {
      throw new Error(`Errand ${id} changed while composing the reply. Review its current state before answering again.`);
    }

    for (const sessionId of targetSessionIds) {
      this.pushToSession(sessionId, reply);
    }

    const updatedNotes = (errand.notes ? errand.notes + '\n' : '') + `Principal answer: "${answer}"`;
    const updated = this.transition(errand, {
      state: 'awaiting_peer',
      notes: updatedNotes,
      pendingMessage: undefined,
      lastProgressAt: nowISO(),
    });

    this.pushToSession(
      errand.originSessionId,
      `📤 Errand "${errand.goal}" resumed. Sent to contact: "${reply}"`,
    );

    return { errand: updated, reply };
  }

  findActiveForPeer(channel: string, peerId: string): { errand: Errand; sessionId: string } | null {
    const active = this.errandRepository.findActiveByPeer(channel, peerAliases(channel, peerId));
    if (!active) return null;

    const hydrated = this.hydrate(active.errand);
    if (!NEGOTIATING_STATES.includes(hydrated.state)) return null;

    return { errand: hydrated, sessionId: active.sessionId };
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
      const target = this.sessionRepository.findById(sessionId);
      if (!target) continue;
      const next = this.errandRepository.findNextQueuedByPeer(target.channel, peerAliases(target.channel, target.peerId));
      if (!next || promoted.has(next.id)) continue;

      const stillBlocked = this.errandRepository
        .findTargets(next.id)
        .some((targetSessionId) => {
          const other = this.sessionRepository.findById(targetSessionId);
          return !other || !!this.errandRepository.findActiveByPeer(other.channel, peerAliases(other.channel, other.peerId));
        });

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
        sessionId: session.id,
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
