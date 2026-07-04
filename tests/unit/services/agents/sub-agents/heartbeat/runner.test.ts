import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { config } from '../../../../../../src/config';
import type { ILogger } from '../../../../../../src/infrastructure/logger';

const heartbeatHandler = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('../../../../../../src/services/agents/sub-agents/heartbeat/sub-agent', () => ({
  HeartbeatFactory: {
    create: vi.fn(() => ({ handler: heartbeatHandler })),
  },
}));

import { HeartbeatSingleton } from '../../../../../../src/services/agents/sub-agents/heartbeat/runner';
import { HeartbeatFactory } from '../../../../../../src/services/agents/sub-agents/heartbeat/sub-agent';

function makeLogger(): ILogger {
  return { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };
}

function resetSingleton(): void {
  (HeartbeatSingleton as unknown as { instance: unknown }).instance = undefined;
}

describe('HeartbeatSingleton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSingleton();
    vi.useFakeTimers();
    Object.defineProperty(config.HEARTBEAT, 'ENABLED', { value: true, configurable: true });
    heartbeatHandler.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    resetSingleton();
  });

  it('does not schedule ticks when heartbeat is disabled', () => {
    const originalEnabled = config.HEARTBEAT.ENABLED;
    Object.defineProperty(config.HEARTBEAT, 'ENABLED', { value: false, configurable: true });

    try {
      const logger = makeLogger();
      const runner = HeartbeatSingleton.getInstance(logger, 1000, { sendMessage: vi.fn() } as never);
      runner.start();

      vi.advanceTimersByTime(5000);
      expect(HeartbeatFactory.create).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Heartbeat disabled by configuration.');
    } finally {
      Object.defineProperty(config.HEARTBEAT, 'ENABLED', { value: originalEnabled, configurable: true });
    }
  });

  it('runs the heartbeat agent on each interval tick', async () => {
    const logger = makeLogger();
    const runner = HeartbeatSingleton.getInstance(logger, 1000, { sendMessage: vi.fn() } as never);

    runner.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);

    expect(HeartbeatFactory.create).toHaveBeenCalled();
    expect(heartbeatHandler).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Agent waking up'));
  });

  it('does not create a second timer when start is called twice', async () => {
    const logger = makeLogger();
    const runner = HeartbeatSingleton.getInstance(logger, 1000, { sendMessage: vi.fn() } as never);

    runner.start();
    runner.start();

    await vi.advanceTimersByTimeAsync(3000);
    expect(HeartbeatFactory.create).toHaveBeenCalledTimes(3);
  });

  it('stops scheduling ticks after stop is called', async () => {
    const logger = makeLogger();
    const runner = HeartbeatSingleton.getInstance(logger, 1000, { sendMessage: vi.fn() } as never);

    runner.start();
    await vi.advanceTimersByTimeAsync(1000);
    runner.stop();
    await vi.advanceTimersByTimeAsync(3000);

    expect(HeartbeatFactory.create).toHaveBeenCalledTimes(1);
  });

  it('skips overlapping ticks while a run is still active', async () => {
    const logger = makeLogger();
    let release!: () => void;
    heartbeatHandler.mockImplementation(
      () => new Promise<void>((resolve) => { release = resolve; }),
    );

    const runner = HeartbeatSingleton.getInstance(logger, 1000, { sendMessage: vi.fn() } as never);
    runner.start();

    await vi.advanceTimersByTimeAsync(1000);

    expect(HeartbeatFactory.create).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(logger.warn).toHaveBeenCalledWith(
      'Heartbeat tick skipped because the previous run is still active.',
    );

    release();
    await vi.advanceTimersByTimeAsync(1000);
    expect(HeartbeatFactory.create).toHaveBeenCalledTimes(2);
  });

  it('logs heartbeat failures from the runner', async () => {
    const logger = makeLogger();
    heartbeatHandler.mockRejectedValue(new Error('boom'));

    const runner = HeartbeatSingleton.getInstance(logger, 1000, { sendMessage: vi.fn() } as never);
    runner.start();

    await vi.advanceTimersByTimeAsync(1000);

    expect(logger.error).toHaveBeenCalledWith(
      'Heartbeat failed.',
      expect.objectContaining({ error: 'boom' }),
    );
  });

  it('returns the same runner instance from getInstance', () => {
    const logger = makeLogger();
    const channelsManager = { sendMessage: vi.fn() } as never;
    const first = HeartbeatSingleton.getInstance(logger, 1000, channelsManager);
    const second = HeartbeatSingleton.getInstance(makeLogger(), 2000, channelsManager);

    expect(second).toBe(first);
  });
});
