import { describe, expect, it } from 'vitest';
import { Errand } from '../../../../src/entities/errand';
import { formatOpenErrandsBlock } from '../../../../src/services/errands/prompt';

const errand = (patch: Partial<ConstructorParameters<typeof Errand>[0]>) =>
  new Errand({ id: 'e1', goal: 'Book a class', originSessionId: 'chat', ...patch });

describe('formatOpenErrandsBlock', () => {
  it('returns null when no errand is in flight', () => {
    expect(formatOpenErrandsBlock([])).toBeNull();
    expect(formatOpenErrandsBlock([errand({ state: 'resolved' }), errand({ id: 'e2', state: 'cancelled' })])).toBeNull();
  });

  it('lists pending questions and drafts with the tool to use for each', () => {
    const block = formatOpenErrandsBlock([
      errand({ state: 'awaiting_principal', pendingMessage: 'Wednesday instead?' }),
      errand({ id: 'e2', goal: 'Buy milk', state: 'draft', pendingMessage: 'Hi! Do you have milk?' }),
      errand({ id: 'e3', goal: 'Call the plumber', state: 'awaiting_peer', pendingMessage: 'stale text' }),
    ])!;
    expect(block).toContain('answer_errand');
    expect(block).toContain('approve_errand');
    expect(block).toContain('- [e1] waiting on the human\'s answer — Book a class\n  Pending question: Wednesday instead?');
    expect(block).toContain('- [e2] draft opener awaiting the human\'s approval — Buy milk\n  Draft opener: Hi! Do you have milk?');
    expect(block).toContain('- [e3] waiting on the contact — Call the plumber');
    expect(block).not.toContain('stale text');
  });

  it('reports an incomplete delivery instead of the staged message', () => {
    const block = formatOpenErrandsBlock([errand({
      state: 'draft',
      pendingMessage: 'Hello',
      pendingDelivery: { id: 'd1', type: 'opener', content: 'Hello', targets: [{ sessionId: 's1' }], error: 'Channel offline' },
    })])!;
    expect(block).toContain('Delivery incomplete: Channel offline');
    expect(block).not.toContain('Draft opener');
  });
});
