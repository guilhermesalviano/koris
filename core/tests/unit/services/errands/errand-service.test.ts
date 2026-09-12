import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrandService } from '../../../../src/services/errands';
import { Errand } from '../../../../src/entities/errand';
import { applyTestConfigDefaults } from '../../../helpers/test-config';

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
    findByOriginSessionId: vi.fn().mockReturnValue([]),
    findAll: vi.fn().mockReturnValue([]),
    addTarget: vi.fn(),
    findTargets: vi.fn().mockReturnValue([]),
    countByState: vi.fn().mockReturnValue(0),
  };
}

function makeSessionRepo() {
  return {
    findById: vi.fn(),
    findLatestOpen: vi.fn(),
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
    it('creates a draft errand, resolves/creates a delegated session per target, and links them', () => {
      const { service, db, errandRepo, sessionManager } = makeService();

      const errand = service.create('buy milk', [{ channel: 'whatsapp', peerId: '555' }], 'origin-1', 'hi, can you get milk?');

      expect(db.transaction).toHaveBeenCalledTimes(1);
      expect(sessionManager.getSessionService).toHaveBeenCalledWith({ channel: 'whatsapp', peerId: '555', kind: 'delegated' });
      expect(errand.state).toBe('draft');
      expect(errand.pendingMessage).toBe('hi, can you get milk?');
      expect(errandRepo.save).toHaveBeenCalledTimes(1);
      expect(errandRepo.addTarget).toHaveBeenCalledWith(errand.id, 'session-whatsapp-555');
    });

    it('queues instead of drafting when the target session already has an active errand', () => {
      const { service, errandRepo } = makeService();
      errandRepo.findActiveBySessionId.mockReturnValue(new Errand({ id: 'existing', goal: 'x', originSessionId: 'origin-0' }));

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

      expect(outbound.send).toHaveBeenCalledWith({ channel: 'whatsapp', target: '555', content: 'hi there', kind: 'delegated' });
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

    it('records the message directly in a non-deliverable (web/tui) origin session instead of sending outbound', () => {
      const { service, errandRepo, sessionRepo, sessionManager, outbound } = makeService();
      errandRepo.findById.mockReturnValue(new Errand({ id: 'e1', goal: 'buy milk', state: 'open', originSessionId: 'origin-1' }));
      sessionRepo.findById.mockReturnValue({ id: 'origin-1', channel: 'web', peerId: 'web', kind: 'user' });

      service.escalate('e1', 'what brand?');

      expect(outbound.send).not.toHaveBeenCalled();
      expect(sessionManager.getSessionServiceById).toHaveBeenCalledWith('origin-1');
    });
  });

  describe('resolve / fail / cancel', () => {
    it('resolve closes the errand, sets result and closedAt, and notifies the origin', () => {
      const { service, errandRepo, sessionRepo } = makeService();
      errandRepo.findById.mockReturnValue(new Errand({ id: 'e1', goal: 'buy milk', state: 'awaiting_peer', originSessionId: 'origin-1' }));
      sessionRepo.findById.mockReturnValue({ id: 'origin-1', channel: 'web', peerId: 'web', kind: 'user' });

      const result = service.resolve('e1', 'they said yes, on the way');

      expect(result.state).toBe('resolved');
      expect(result.result).toBe('they said yes, on the way');
      expect(result.closedAt).toBeDefined();
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
      errandRepo.findNextQueuedBySessionId.mockReturnValue(queued);
      errandRepo.findActiveBySessionId.mockReturnValue(null);

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
      errandRepo.findNextQueuedBySessionId.mockReturnValue(queued);
      errandRepo.findActiveBySessionId.mockImplementation((sessionId: string) =>
        sessionId === 'other-target' ? new Errand({ id: 'blocker', goal: 'g', originSessionId: 'o3' }) : null,
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
    it('returns null when the peer has no delegated session at all (never creates one)', () => {
      const { service, sessionRepo, sessionManager } = makeService();
      sessionRepo.findLatestOpen.mockReturnValue(null);

      const found = service.findActiveForPeer('whatsapp', '555');

      expect(found).toBeNull();
      expect(sessionRepo.findLatestOpen).toHaveBeenCalledWith({ channel: 'whatsapp', peerId: '555', kind: 'delegated' });
      expect(sessionManager.getSessionService).not.toHaveBeenCalled();
    });

    it('returns null when the delegated session has no active errand', () => {
      const { service, sessionRepo, errandRepo } = makeService();
      sessionRepo.findLatestOpen.mockReturnValue({ id: 'delegated-session' });
      errandRepo.findActiveBySessionId.mockReturnValue(null);

      expect(service.findActiveForPeer('whatsapp', '555')).toBeNull();
    });

    it('returns the hydrated active errand and session id when one exists', () => {
      const { service, sessionRepo, errandRepo } = makeService();
      sessionRepo.findLatestOpen.mockReturnValue({ id: 'delegated-session' });
      errandRepo.findActiveBySessionId.mockReturnValue(
        new Errand({ id: 'e1', goal: 'buy milk', state: 'awaiting_peer', originSessionId: 'o1' }),
      );

      const found = service.findActiveForPeer('whatsapp', '555');

      expect(found).toEqual({ errand: expect.objectContaining({ id: 'e1' }), sessionId: 'delegated-session' });
    });
  });
});
