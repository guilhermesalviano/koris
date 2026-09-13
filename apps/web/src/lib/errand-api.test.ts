import { afterEach, describe, expect, it, vi } from 'vitest';
import { answerErrand, runErrandAction } from './errand-api';

afterEach(() => vi.unstubAllGlobals());

describe('errand API', () => {
  it('posts an errand action to its endpoint, escaping the id', async () => {
    const fetch = vi.fn(async () => Response.json({ state: 'resolved' }));
    vi.stubGlobal('fetch', fetch);
    await expect(runErrandAction('e/1', 'confirm')).resolves.toEqual({ state: 'resolved' });
    expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/admin/errands/e%2F1/confirm', expect.objectContaining({ method: 'POST' }));
  });

  it('sends the answer as JSON and surfaces the server error', async () => {
    const fetch = vi.fn(async () => Response.json({ error: 'This errand is busy.' }, { status: 400 }));
    vi.stubGlobal('fetch', fetch);
    await expect(answerErrand('e1', 'also a juice')).rejects.toThrow('This errand is busy.');
    expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/admin/errands/e1/reply', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ answer: 'also a juice' }),
    }));
  });
});
