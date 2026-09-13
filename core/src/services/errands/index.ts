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
import { ErrandDelivery, ErrandState, ERRAND_OPEN_STATES } from '../../types/errand';
import { generateId } from '../../utils/generate-id';
import { runErrandOperation } from './operations';

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
  approve(id: string): Promise<Errand>;
  retryDelivery(id: string): Promise<Errand>;
  recordPeerReply(id: string, notes?: string): Errand;
  escalate(id: string, question: string, notes?: string): Errand;
  resolve(id: string, result: string, notes?: string): Errand;
  resolveWithClosingReply(id: string, sessionId: string, reply: string, result: string, notes?: string): Promise<Errand>;
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

    this.expireStale();
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

  approve(id: string): Promise<Errand> {
    return runErrandOperation(id, async () => {
      const errand = this.mustFind(id);
      if (errand.state !== 'draft') {
        throw new Error(`Errand ${id} is not awaiting approval (state=${errand.state}).`);
      }
      this.ensureNoDelivery(errand);
      const prepared = this.prepareDelivery(errand, 'opener', errand.pendingMessage ?? '');
      return this.deliverPrepared(prepared);
    }, true);
  }

  retryDelivery(id: string): Promise<Errand> {
    return runErrandOperation(id, async () => this.deliverPrepared(this.mustFind(id)), true);
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

  async resolveWithClosingReply(id: string, sessionId: string, reply: string, result: string, notes?: string): Promise<Errand> {
    const errand = this.mustFind(id);
    if (errand.state !== 'open' && errand.state !== 'awaiting_peer') return errand;
    if (!this.errandRepository.findTargets(id).includes(sessionId)) {
      throw new Error(`Session ${sessionId} is not a target of errand ${id}.`);
    }
    const session = this.sessionRepository.findById(sessionId);
    if (!session) throw new Error(`Errand target session not found: ${sessionId}`);
    const delivery = await this.outboundMessageService.send({
      channel: session.channel,
      target: session.peerId,
      kind: session.kind,
      sessionId,
      content: reply,
    });
    if (delivery.status !== 'sent') {
      throw new Error(`Could not deliver the closing reply for errand ${id}.`);
    }
    const latest = this.mustFind(id);
    if (latest.state !== errand.state) return latest;
    return this.resolve(id, result, notes);
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

    return this.close(errand, 'expired', undefined, undefined);
  }

  get(id: string): Errand | null {
    const errand = this.errandRepository.findById(id);
    return errand ? this.hydrate(errand) : null;
  }

  listByOrigin(originSessionId: string): Errand[] {
    this.expireStale();
    return this.errandRepository.findByOriginSessionId(originSessionId).map((errand) => this.hydrate(errand));
  }

  listAll(state?: ErrandState, limit?: number, offset?: number): Errand[] {
    this.expireStale();
    return this.errandRepository.findAll(state, limit, offset).map((errand) => this.hydrate(errand));
  }

  resumeWithPrincipalAnswer(id: string, answer: string): Promise<{ errand: Errand; reply: string }> {
    return runErrandOperation(id, () => this.prepareResume(id, answer), true);
  }

  private async prepareResume(id: string, answer: string): Promise<{ errand: Errand; reply: string }> {
    const errand = this.mustFind(id);
    if (errand.state !== 'awaiting_principal') {
      throw new Error(`Errand ${id} is not awaiting your input (state=${errand.state}).`);
    }
    this.ensureNoDelivery(errand);

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

    const updated = await this.deliverPrepared(this.prepareDelivery(latest, 'resume', reply, answer));
    return { errand: updated, reply };
  }

  private ensureNoDelivery(errand: Errand): void {
    if (errand.pendingDelivery) {
      throw new Error(`A prepared message is pending delivery. Use /errand retry ${errand.id} or cancel the errand.`);
    }
  }

  private prepareDelivery(errand: Errand, type: ErrandDelivery['type'], content: string, answer?: string): Errand {
    const targets = this.errandRepository.findTargets(errand.id).map((sessionId) => ({ sessionId }));
    if (!targets.length || !content.trim()) throw new Error('Cannot deliver an empty message or an errand without targets.');
    return this.transition(errand, { pendingDelivery: { id: generateId(), type, content, answer, targets } });
  }

  private async deliverPrepared(errand: Errand): Promise<Errand> {
    const batch = errand.pendingDelivery;
    if (!batch || errand.state !== (batch.type === 'opener' ? 'draft' : 'awaiting_principal')) {
      throw new Error('This errand has no retryable delivery.');
    }
    const current = () => {
      const latest = this.mustFind(errand.id);
      if (latest.state !== errand.state || latest.pendingDelivery?.id !== batch.id) {
        throw new Error('The errand changed during delivery. No further messages will be sent.');
      }
      return latest;
    };
    for (const target of batch.targets) {
      current();
      if (target.sentAt) continue;
      let failure: string | undefined;
      try {
        const session = this.sessionRepository.findById(target.sessionId);
        if (!session) throw new Error('Target session no longer exists.');
        const delivery = await this.outboundMessageService.send({
          channel: session.channel, target: session.peerId, kind: session.kind,
          sessionId: session.id, content: batch.content,
        });
        if (delivery.status !== 'sent') throw new Error(delivery.errorMessage || 'Channel delivery failed.');
      } catch (error) {
        failure = error instanceof Error ? error.message : 'Channel delivery failed.';
      }
      const latest = current();
      target.error = failure;
      if (!failure) target.sentAt = nowISO();
      batch.error = batch.targets.find((item) => item.error)?.error;
      this.transition(latest, { pendingDelivery: batch });
    }
    const latest = current();
    if (batch.targets.some((target) => !target.sentAt)) {
      throw new Error(`Message delivery failed. The prepared message is saved; use /errand retry ${errand.id}.`);
    }
    const notes = batch.type === 'resume'
      ? (latest.notes ? latest.notes + '\n' : '') + `Principal answer: "${batch.answer}"`
      : latest.notes;
    const updated = this.transition(latest, {
      state: 'awaiting_peer', pendingMessage: undefined, pendingDelivery: undefined,
      notes, lastProgressAt: nowISO(),
    });
    if (batch.type === 'resume') {
      this.pushToSession(errand.originSessionId, `📤 Errand "${errand.goal}" resumed. Sent to contact: "${batch.content}"`);
    }
    return updated;
  }

  private expireStale(): void {
    for (const state of ERRAND_OPEN_STATES) {
      for (const errand of this.errandRepository.findAll(state, -1)) this.hydrate(errand);
    }
  }

  findActiveForPeer(channel: string, peerId: string): { errand: Errand; sessionId: string } | null {
    this.expireStale();
    const active = this.errandRepository.findActiveByPeer(channel, peerAliases(channel, peerId));
    if (!active) return null;

    const hydrated = this.hydrate(active.errand);
    if (!NEGOTIATING_STATES.includes(hydrated.state) && !(hydrated.state === 'draft' && hydrated.pendingDelivery)) return null;

    return { errand: hydrated, sessionId: active.sessionId };
  }

  private close(errand: Errand, state: ErrandState, result: string | undefined, notes: string | undefined, notice?: string): Errand {
    const closedAt = nowISO();
    const updated = this.transition(errand, {
      state,
      pendingDelivery: undefined,
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
      }).catch(() => this.logger.warn('Could not deliver errand notice.'));
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
