import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrandService } from '../../../../src/services/errands';
import { Errand } from '../../../../src/entities/errand';
import { THIRD_PARTY_CONVERSATION_CONTEXT } from '../../../../src/constants';
import { applyTestConfigDefaults } from '../../../helpers/test-config';

const { mockComposeResume } = vi.hoisted(() => ({ mockComposeResume: vi.fn().mockResolvedValue('resumed reply') }));
vi.mock('../../../../src/services/agents/sub-agents/negotiator/sub-agent', () => ({
  NegotiatorFactory: {
    create: () => ({ composeResume: mockComposeResume }),
  },
}));

function makeDb() {
  return { transaction: vi.fn((fn: () => unknown) => fn()), run: vi.fn(), get: vi.fn(), query: vi.fn(() => []) };
}

function makeErrandRepo() {
  return {
    save: vi.fn(),
    update: vi.fn(),
    findById: vi.fn(),
    findActiveBySessionId: vi.fn().mockReturnValue(null),
    findNextQueuedBySessionId: vi.fn().mockReturnValue(null),
    findActiveByPeer: vi.fn().mockReturnValue(null),
    findNextQueuedByPeer: vi.fn().mockReturnValue(null),
    findByOriginSessionId: vi.fn().mockReturnValue([]),
    findAll: vi.fn().mockReturnValue([]),
    addTarget: vi.fn(),
    findTargets: vi.fn().mockReturnValue([]),
    countByState: vi.fn().mockReturnValue(0),
  };
}

function makeSessionRepo() {
  return {
    findById: vi.fn((id: string) => ({ id, channel: 'whatsapp', peerId: id, kind: 'delegated' })),
    findLatestOpen: vi.fn(),
    save: vi.fn(),
  };
}

function makeSessionManager() {
  return {
    getSessionService: vi.fn((key: { channel: string; peerId: string; kind?: string }) => ({
      getSession: () => ({ id: `session-${key.channel}-${key.peerId}` }),
    })),
    getSessionServiceById: vi.fn((id: string) => ({
      getSession: () => ({ id }),
      ensureActiveSession: () => ({ id }),
      updateCount: vi.fn(),
    })),
  };
}

function makeOutbound() {
  return { send: vi.fn().mockResolvedValue({}) };
}

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

function makeService(overrides: { now?: () => Date } = {}) {
  const db = makeDb();
  const errandRepo = makeErrandRepo();
  const sessionRepo = makeSessionRepo();
  const sessionManager = makeSessionManager();
  const outbound = makeOutbound();
  const logger = makeLogger();

  const service = new ErrandService(
    db as never,
    errandRepo as never,
    sessionRepo as never,
    sessionManager as never,
    outbound as never,
    logger as never,
    overrides.now,
  );

  return { service, db, errandRepo, sessionRepo, sessionManager, outbound, logger };
}

describe('ErrandService', () => {
  beforeEach(() => {
    applyTestConfigDefaults();
  });

  describe('create', () => {
    it('creates a fresh child session with the parent link and persisted instructions', () => {
      const { service, db, errandRepo, sessionRepo, sessionManager } = makeService();

      const errand = service.create('buy milk', [{ channel: 'whatsapp', peerId: '555' }], 'origin-1', 'hi, can you get milk?');

      expect(db.transaction).toHaveBeenCalledTimes(1);
      expect(sessionManager.getSessionService).not.toHaveBeenCalled();
      expect(errand.state).toBe('draft');
      expect(errand.pendingMessage).toBe('hi, can you get milk?');
      expect(errandRepo.save).toHaveBeenCalledTimes(1);
      const child = sessionRepo.save.mock.calls[0][0];
      expect(child).toMatchObject({ channel: 'whatsapp', peerId: '555', kind: 'delegated', metadata: {
        parentSessionId: 'origin-1', errandId: errand.id, instructions: THIRD_PARTY_CONVERSATION_CONTEXT,
      } });
      expect(child.id).not.toBe('origin-1');
      expect(child.endedAt).toBeUndefined();
      expect(errandRepo.addTarget).toHaveBeenCalledWith(errand.id, child.id);
    });

    it('queues instead of drafting when the target session already has an active errand', () => {
      const { service, errandRepo } = makeService();
      errandRepo.findActiveByPeer.mockReturnValue({ errand: new Errand({ id: 'existing', goal: 'x', originSessionId: 'origin-0' }), sessionId: 'older-child' });

      const errand = service.create('buy milk', [{ channel: 'whatsapp', peerId: '555' }], 'origin-1', 'hi');

      expect(errand.state).toBe('queued');
    });

    it('rejects a target-less errand', () => {
      const { service } = makeService();
      expect(() => service.create('goal', [], 'origin-1', 'hi')).toThrow();
    });

    it('refuses to create past errands.max_concurrent', () => {
      applyTestConfigDefaults({ errandsMaxConcurrent: 2 });
      const { service, errandRepo } = makeService();
      errandRepo.countByState.mockImplementation((state: string) => (state === 'open' ? 2 : 0));

      expect(() => service.create('goal', [{ channel: 'whatsapp', peerId: '555' }], 'origin-1', 'hi')).toThrow(/Too many errands/);
    });
  });

  describe('approve', () => {
    it('sends the pending message to every target and moves to awaiting_peer', () => {
      const { service, errandRepo, sessionRepo, outbound } = makeService();
      const draft = new Errand({ id: 'e1', goal: 'buy milk', state: 'draft', originSessionId: 'origin-1', pendingMessage: 'hi there' });
      errandRepo.findById.mockReturnValue(draft);
      errandRepo.findTargets.mockReturnValue(['target-session']);
      sessionRepo.findById.mockReturnValue({ id: 'target-session', channel: 'whatsapp', peerId: '555', kind: 'delegated' });

      const result = service.approve('e1');

      expect(outbound.send).toHaveBeenCalledWith({ channel: 'whatsapp', target: '555', content: 'hi there', kind: 'delegated', sessionId: 'target-session' });
      expect(result.state).toBe('awaiting_peer');
      expect(errandRepo.update).toHaveBeenCalledWith('e1', expect.objectContaining({ state: 'awaiting_peer', pendingMessage: undefined }));
    });

    it('refuses to approve an errand that is not a draft', () => {
      const { service, errandRepo } = makeService();
      errandRepo.findById.mockReturnValue(new Errand({ id: 'e1', goal: 'g', state: 'awaiting_peer', originSessionId: 'o1' }));

      expect(() => service.approve('e1')).toThrow(/not awaiting approval/);
    });

    it('throws when the errand does not exist', () => {
      const { service, errandRepo } = makeService();
      errandRepo.findById.mockReturnValue(null);

      expect(() => service.approve('missing')).toThrow(/not found/);
    });
  });

  describe('recordPeerReply', () => {
    it('keeps the errand in awaiting_peer and updates notes', () => {
      const { service, errandRepo } = makeService();
      errandRepo.findById.mockReturnValue(new Errand({ id: 'e1', goal: 'g', state: 'awaiting_peer', originSessionId: 'o1' }));

      const result = service.recordPeerReply('e1', 'they said yes');

      expect(result.state).toBe('awaiting_peer');
      expect(result.notes).toBe('they said yes');
    });
  });

  describe('escalate', () => {
    it('moves to awaiting_principal and pushes a question into the origin session', () => {
      const { service, errandRepo, sessionRepo, outbound } = makeService();
      errandRepo.findById.mockReturnValue(new Errand({ id: 'e1', goal: 'buy milk', state: 'open', originSessionId: 'origin-1' }));
      sessionRepo.findById.mockReturnValue({ id: 'origin-1', channel: 'whatsapp', peerId: '999', kind: 'user' });

      const result = service.escalate('e1', 'what brand do you want?');

      expect(result.state).toBe('awaiting_principal');
      expect(outbound.send).toHaveBeenCalledWith(expect.objectContaining({
        channel: 'whatsapp',
        target: '999',
        content: expect.stringContaining('what brand do you want?'),
      }));
    });

    it('persists the question and reply command in the invoking web session', () => {
      const { service, db, errandRepo, sessionRepo, sessionManager, outbound } = makeService();
      errandRepo.findById.mockReturnValue(new Errand({ id: 'e1', goal: 'buy milk', state: 'open', originSessionId: 'origin-1' }));
      sessionRepo.findById.mockReturnValue({ id: 'origin-1', channel: 'web', peerId: 'web', kind: 'user' });

      service.escalate('e1', 'what brand?');

      expect(outbound.send).not.toHaveBeenCalled();
      expect(sessionManager.getSessionServiceById).toHaveBeenCalledWith('origin-1');
      expect(db.run).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO messages'), [
        expect.any(String), 'origin-1', 'assistant',
        expect.stringContaining('what brand?\n\nReply with: `/errand reply e1 <your answer>`'),
        null, null, expect.any(String),
      ]);
    });
  });

  describe('resolve / fail / cancel', () => {
    it('does not resolve or notify the parent when the closing reply fails delivery', async () => {
      const { service, errandRepo, outbound } = makeService();
      errandRepo.findById.mockReturnValue(new Errand({ id: 'e1', goal: 'Book a haircut', state: 'awaiting_peer', originSessionId: 'parent' }));
      errandRepo.findTargets.mockReturnValue(['contact']);
      outbound.send.mockResolvedValue({ status: 'failed' });

      await expect(service.resolveWithClosingReply('e1', 'contact', 'Thank you!', 'Booked')).rejects.toThrow('Could not deliver the closing reply');

      expect(outbound.send).toHaveBeenCalledTimes(1);
      expect(outbound.send).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'contact', content: 'Thank you!' }));
      expect(errandRepo.update).not.toHaveBeenCalled();
    });

    it('preserves cancellation while a closing reply is being delivered', async () => {
      const { service, errandRepo, outbound } = makeService();
      const errand = new Errand({ id: 'e1', goal: 'Book a haircut', state: 'awaiting_peer', originSessionId: 'parent' });
      errandRepo.findById.mockReturnValue(errand);
      errandRepo.findTargets.mockReturnValue(['contact']);
      outbound.send.mockImplementationOnce(async () => {
        errandRepo.findById.mockReturnValue(new Errand({ ...errand, state: 'cancelled' }));
        return { status: 'sent' };
      });

      expect((await service.resolveWithClosingReply('e1', 'contact', 'Thank you!', 'Booked')).state).toBe('cancelled');
      expect(errandRepo.update).not.toHaveBeenCalled();
      expect(outbound.send).toHaveBeenCalledTimes(1);
    });

    it('resolve closes the errand, sets result and closedAt, and notifies the origin', () => {
      const { service, db, errandRepo, sessionRepo } = makeService();
      errandRepo.findById.mockReturnValue(new Errand({ id: 'e1', goal: 'buy milk', state: 'awaiting_peer', originSessionId: 'origin-1' }));
      sessionRepo.findById.mockReturnValue({ id: 'origin-1', channel: 'web', peerId: 'web', kind: 'user' });

      const result = service.resolve('e1', 'they said yes, on the way');

      expect(result.state).toBe('resolved');
      expect(result.result).toBe('they said yes, on the way');
      expect(result.closedAt).toBeDefined();
      expect(db.run).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO messages'), [
        expect.any(String), 'origin-1', 'assistant',
        expect.stringContaining('resolved: they said yes, on the way'),
        null, null, expect.any(String),
      ]);
    });

    it('fail closes the errand as failed with a reason', () => {
      const { service, errandRepo, sessionRepo } = makeService();
      errandRepo.findById.mockReturnValue(new Errand({ id: 'e1', goal: 'buy milk', state: 'awaiting_peer', originSessionId: 'origin-1' }));
      sessionRepo.findById.mockReturnValue({ id: 'origin-1', channel: 'web', peerId: 'web', kind: 'user' });

      const result = service.fail('e1', 'they refused');

      expect(result.state).toBe('failed');
      expect(result.result).toBe('they refused');
    });

    it('cancel closes the errand without a result and without notifying anyone', () => {
      const { service, errandRepo, sessionRepo, outbound } = makeService();
      errandRepo.findById.mockReturnValue(new Errand({ id: 'e1', goal: 'buy milk', state: 'draft', originSessionId: 'origin-1' }));

      const result = service.cancel('e1');

      expect(result.state).toBe('cancelled');
      expect(outbound.send).not.toHaveBeenCalled();
      expect(sessionRepo.findById).not.toHaveBeenCalled();
    });

    it('promotes the oldest queued errand for a freed target session back to draft', () => {
      const { service, errandRepo } = makeService();
      const closing = new Errand({ id: 'e1', goal: 'buy milk', state: 'awaiting_peer', originSessionId: 'origin-1' });
      errandRepo.findById.mockReturnValue(closing);
      errandRepo.findTargets.mockImplementation((id: string) => (id === 'e1' ? ['target-session'] : ['target-session']));
      const queued = new Errand({ id: 'e2', goal: 'buy bread', state: 'queued', originSessionId: 'origin-2' });
      errandRepo.findNextQueuedByPeer.mockReturnValue(queued);
      errandRepo.findActiveByPeer.mockReturnValue(null);

      service.cancel('e1');

      expect(errandRepo.update).toHaveBeenCalledWith('e2', { state: 'draft' });
    });

    it('does not promote a queued errand while one of its OTHER targets is still active', () => {
      const { service, errandRepo } = makeService();
      const closing = new Errand({ id: 'e1', goal: 'buy milk', state: 'awaiting_peer', originSessionId: 'origin-1' });
      errandRepo.findById.mockReturnValue(closing);
      const queued = new Errand({ id: 'e2', goal: 'buy bread', state: 'queued', originSessionId: 'origin-2' });
      errandRepo.findTargets.mockImplementation((id: string) => {
        if (id === 'e1') return ['target-session'];
        if (id === 'e2') return ['target-session', 'other-target'];
        return [];
      });
      errandRepo.findNextQueuedByPeer.mockReturnValue(queued);
      errandRepo.findActiveByPeer.mockImplementation((_channel: string, peerIds: string[]) =>
        peerIds.includes('other-target') ? { errand: new Errand({ id: 'blocker', goal: 'g', originSessionId: 'o3' }), sessionId: 'blocker-child' } : null,
      );

      service.cancel('e1');

      expect(errandRepo.update).not.toHaveBeenCalledWith('e2', { state: 'draft' });
    });
  });

  describe('lazy expiry (hydrate)', () => {
    it('flips a stale in-flight errand to expired on read', () => {
      applyTestConfigDefaults({ errandsHardExpiryMs: 1000 });
      const now = () => new Date('2026-01-01T01:00:00.000Z');
      const { service, errandRepo } = makeService({ now });
      const stale = new Errand({
        id: 'e1',
        goal: 'g',
        state: 'awaiting_peer',
        originSessionId: 'o1',
        lastProgressAt: '2026-01-01T00:00:00.000Z',
      });
      errandRepo.findById.mockReturnValue(stale);

      const result = service.get('e1');

      expect(result?.state).toBe('expired');
      expect(errandRepo.update).toHaveBeenCalledWith('e1', expect.objectContaining({ state: 'expired' }));
    });

    it('leaves a fresh in-flight errand untouched', () => {
      applyTestConfigDefaults({ errandsHardExpiryMs: 60 * 60 * 1000 });
      const now = () => new Date('2026-01-01T00:00:30.000Z');
      const { service, errandRepo } = makeService({ now });
      const fresh = new Errand({
        id: 'e1',
        goal: 'g',
        state: 'awaiting_peer',
        originSessionId: 'o1',
        lastProgressAt: '2026-01-01T00:00:00.000Z',
      });
      errandRepo.findById.mockReturnValue(fresh);

      const result = service.get('e1');

      expect(result?.state).toBe('awaiting_peer');
      expect(errandRepo.update).not.toHaveBeenCalled();
    });

    it('never expires a draft, queued, or already-closed errand', () => {
      applyTestConfigDefaults({ errandsHardExpiryMs: 1 });
      const now = () => new Date('2026-01-01T05:00:00.000Z');
      const { service, errandRepo } = makeService({ now });

      for (const state of ['draft', 'queued', 'resolved', 'failed', 'cancelled'] as const) {
        errandRepo.update.mockClear();
        errandRepo.findById.mockReturnValue(new Errand({ id: 'e1', goal: 'g', state, originSessionId: 'o1', createdAt: '2026-01-01T00:00:00.000Z' }));
        service.get('e1');
        expect(errandRepo.update).not.toHaveBeenCalled();
      }
    });

    it('listAll and listByOrigin hydrate every result', () => {
      const now = () => new Date('2026-01-02T00:00:00.000Z');
      const { service, errandRepo } = makeService({ now });
      applyTestConfigDefaults({ errandsHardExpiryMs: 1000 });
      const stale = new Errand({ id: 'e1', goal: 'g', state: 'awaiting_peer', originSessionId: 'o1', createdAt: '2026-01-01T00:00:00.000Z' });
      errandRepo.findAll.mockReturnValue([stale]);
      errandRepo.findByOriginSessionId.mockReturnValue([stale]);

      expect(service.listAll()[0].state).toBe('expired');
      expect(service.listByOrigin('o1')[0].state).toBe('expired');
    });
  });

  describe('findActiveForPeer', () => {
    it('does not take over the contact conversation for an unapproved draft', () => {
      const { service, errandRepo } = makeService();
      errandRepo.findActiveByPeer.mockReturnValue({
        errand: new Errand({ id: 'e1', goal: 'haircut', state: 'draft', originSessionId: 'o1' }), sessionId: 'child',
      });
      expect(service.findActiveForPeer('whatsapp', '555')).toBeNull();
    });

    it('returns null without creating a session when no errand matches the contact', () => {
      const { service, errandRepo, sessionManager, sessionRepo } = makeService();
      expect(service.findActiveForPeer('whatsapp', '555')).toBeNull();
      expect(errandRepo.findActiveByPeer).toHaveBeenCalledWith('whatsapp', ['555', '555@s.whatsapp.net']);
      expect(sessionManager.getSessionService).not.toHaveBeenCalled();
      expect(sessionRepo.save).not.toHaveBeenCalled();
    });

    it('returns the matched errand child rather than the latest session for the contact', () => {
      const { service, errandRepo, sessionRepo } = makeService();
      errandRepo.findActiveByPeer.mockReturnValue({
        errand: new Errand({ id: 'e1', goal: 'haircut', state: 'awaiting_peer', originSessionId: 'o1' }), sessionId: 'older-active-child',
      });
      expect(service.findActiveForPeer('whatsapp', '555@s.whatsapp.net')).toEqual({
        errand: expect.objectContaining({ id: 'e1' }), sessionId: 'older-active-child',
      });
      expect(errandRepo.findActiveByPeer).toHaveBeenCalledWith('whatsapp', ['555@s.whatsapp.net', '555']);
      expect(sessionRepo.findLatestOpen).not.toHaveBeenCalled();
    });
  });

  describe('resumeWithPrincipalAnswer', () => {
    it('does not send or reopen an errand cancelled while composing the approved reply', async () => {
      const { service, errandRepo, sessionRepo, outbound } = makeService();
      errandRepo.findById.mockReturnValue(new Errand({ id: 'e1', goal: 'haircut', state: 'awaiting_principal', originSessionId: 'o1' }));
      errandRepo.findTargets.mockReturnValue(['target-1']);
      sessionRepo.findById.mockReturnValue({ id: 'target-1', channel: 'whatsapp', peerId: '555', kind: 'delegated' });
      mockComposeResume.mockImplementationOnce(async () => {
        errandRepo.findById.mockReturnValue(new Errand({ id: 'e1', goal: 'haircut', state: 'cancelled', originSessionId: 'o1' }));
        return 'Please book 11';
      });
      await expect(service.resumeWithPrincipalAnswer('e1', '11 works')).rejects.toThrow('changed while composing');
      expect(outbound.send).not.toHaveBeenCalled();
      expect(errandRepo.update).not.toHaveBeenCalled();
    });
    it('throws if errand is not awaiting_principal', async () => {
      const { service, errandRepo } = makeService();
      errandRepo.findById.mockReturnValue(new Errand({ id: 'e1', goal: 'g', state: 'awaiting_peer', originSessionId: 'o1' }));

      await expect(service.resumeWithPrincipalAnswer('e1', 'yes')).rejects.toThrow(/not awaiting your input/);
    });

    it('resumes the errand, drafts reply, delivers to targets, and notifies origin', async () => {
      const { service, errandRepo, sessionRepo, outbound } = makeService();
      errandRepo.findById.mockReturnValue(
        new Errand({ id: 'e1', goal: 'haircut', state: 'awaiting_principal', originSessionId: 'o1', notes: 'prev notes' }),
      );
      errandRepo.findTargets.mockReturnValue(['target-1']);
      sessionRepo.findById.mockImplementation((id: string) => {
        if (id === 'target-1') return { id: 'target-1', channel: 'whatsapp', peerId: '555', kind: 'delegated' };
        if (id === 'o1') return { id: 'o1', channel: 'whatsapp', peerId: '999', kind: 'user' };
        return null;
      });

      const result = await service.resumeWithPrincipalAnswer('e1', 'Saturday 10am is good');

      expect(result.errand.state).toBe('awaiting_peer');
      expect(result.reply).toBe('resumed reply');
      expect(outbound.send).toHaveBeenCalledWith(expect.objectContaining({
        channel: 'whatsapp',
        target: '555',
        content: 'resumed reply',
      }));
      expect(outbound.send).toHaveBeenCalledWith(expect.objectContaining({
        channel: 'whatsapp',
        target: '999',
        content: expect.stringContaining('resumed reply'),
      }));
    });
  });
});
