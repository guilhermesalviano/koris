import { afterEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../../../src/config';

const { AgentMock } = vi.hoisted(() => ({
  AgentMock: vi.fn().mockImplementation(function Agent(this: { close: () => Promise<void> }) {
    this.close = vi.fn().mockResolvedValue(undefined);
  }),
}));
vi.mock('undici', () => ({ Agent: AgentMock }));

import { providerDispatcher } from '../../../../src/services/providers/http-dispatcher';

describe('providerDispatcher', () => {
  const original = config.AI.TIMEOUTS.HARD_MS;

  afterEach(() => {
    config.AI.TIMEOUTS.HARD_MS = original;
  });

  it('ties the HTTP client header and body timeouts to ai.timeouts.hard_ms and reuses the agent', () => {
    config.AI.TIMEOUTS.HARD_MS = 1_200_000;

    const first = providerDispatcher();

    expect(AgentMock).toHaveBeenLastCalledWith({ headersTimeout: 1_200_000, bodyTimeout: 1_200_000 });
    expect(providerDispatcher()).toBe(first);
  });

  it('replaces the agent when hard_ms changes and closes the previous one', () => {
    config.AI.TIMEOUTS.HARD_MS = 1_200_000;
    const first = providerDispatcher() as unknown as { close: ReturnType<typeof vi.fn> };

    config.AI.TIMEOUTS.HARD_MS = 1_800_000;
    const second = providerDispatcher();

    expect(second).not.toBe(first);
    expect(first.close).toHaveBeenCalled();
    expect(AgentMock).toHaveBeenLastCalledWith({ headersTimeout: 1_800_000, bodyTimeout: 1_800_000 });
  });
});
