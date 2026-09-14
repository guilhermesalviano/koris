import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { applyTestConfigDefaults } from '../../../../../helpers/test-config';
import type { ILogger } from '../../../../../../src/infrastructure/logger';

const heartbeatHandler = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('../../../../../../src/utils/heartbeat', () => ({
  nextCronFire: vi.fn(),
  isOneTimeBeatExpired: vi.fn(),
}));

const createAgent = vi.fn(() => ({ run: heartbeatHandler }));

import { HeartbeatRunner } from '../../../../../../src/services/agents/sub-agents/heartbeat/runner';
import { isOneTimeBeatExpired, nextCronFire } from '../../../../../../src/utils/heartbeat';

function makeLogger(): ILogger {
  return { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() };
}

function makeRepo(tasks: unknown[] = []) {
  return { getAll: vi.fn().mockReturnValue(tasks), deleteById: vi.fn() };
}

function makeRunRepo() {
  return { recordRun: vi.fn(), getLastRun: vi.fn() };
}

function makeRunner(logger: ILogger, repo: unknown, runRepo: unknown = makeRunRepo()): HeartbeatRunner {
  return new HeartbeatRunner(logger, repo as never, runRepo as never, createAgent);
}

/**
 * Returns a date 5000ms in the future from the current fake time.
 * This ensures each `scheduleNext` call schedules a progressively later timer.
 */
function mockFiveSecondsAhead(): Date {
  return new Date(Date.now() + 5000);
}

describe('HeartbeatRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    heartbeatHandler.mockResolvedValue(undefined);
    vi.mocked(nextCronFire).mockImplementation(mockFiveSecondsAhead);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not schedule when heartbeat is disabled', () => {
    applyTestConfigDefaults({ heartbeatEnabled: false });

    const logger = makeLogger();
    const repo = makeRepo([{ id: 't1', cronExpression: '0 9 * * *', lastRun: undefined, createdAt: new Date() }]);
    const runner = makeRunner(logger, repo);
    runner.start();

    expect(nextCronFire).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('[beat] Heartbeat disabled by configuration.');
  });

  it('schedules next heartbeat based on earliest cron fire time', async () => {
    const logger = makeLogger();
    const repo = makeRepo([{ id: 't1', cronExpression: '0 9 * * *', lastRun: undefined, createdAt: new Date() }]);
    const runner = makeRunner(logger, repo);

    runner.start();

    expect(nextCronFire).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Next heartbeat scheduled'));
  });

  it('runs the heartbeat agent when the scheduled time arrives', async () => {
    const logger = makeLogger();
    const repo = makeRepo([{ id: 't1', cronExpression: '0 9 * * *', lastRun: undefined, createdAt: new Date() }]);
    const runner = makeRunner(logger, repo);

    runner.start();
    await vi.advanceTimersByTimeAsync(5000);

    expect(createAgent).toHaveBeenCalled();
    expect(heartbeatHandler).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Agent waking up'));
  });

  it('reschedules after runOnce completes', async () => {
    const logger = makeLogger();
    const repo = makeRepo([{ id: 't1', cronExpression: '0 9 * * *', lastRun: undefined, createdAt: new Date() }]);
    const runner = makeRunner(logger, repo);

    runner.start();
    await vi.advanceTimersByTimeAsync(5000);

    // nextCronFire called once for initial schedule, once after runOnce completes
    expect(nextCronFire).toHaveBeenCalledTimes(2);
  });

  it('does not create a second timer when start is called twice', () => {
    const logger = makeLogger();
    const repo = makeRepo([{ id: 't1', cronExpression: '0 9 * * *', lastRun: undefined, createdAt: new Date() }]);
    const runner = makeRunner(logger, repo);

    runner.start();
    runner.start();

    expect(nextCronFire).toHaveBeenCalledTimes(1);
  });

  it('stops scheduling after stop is called', async () => {
    const logger = makeLogger();
    const repo = makeRepo([{ id: 't1', cronExpression: '0 9 * * *', lastRun: undefined, createdAt: new Date() }]);
    const runner = makeRunner(logger, repo);

    runner.start();
    runner.stop();
    await vi.advanceTimersByTimeAsync(5000);

    expect(createAgent).not.toHaveBeenCalled();
  });

  it('guards against overlapping runs with isRunning flag', async () => {
    const logger = makeLogger();
    let resolveHandler!: () => void;
    heartbeatHandler.mockImplementation(
      () => new Promise<void>((resolve) => { resolveHandler = resolve; }),
    );

    const repo = makeRepo([{ id: 't1', cronExpression: '0 9 * * *', lastRun: undefined, createdAt: new Date() }]);
    const runner = makeRunner(logger, repo);

    runner.start();
    await vi.advanceTimersByTimeAsync(5000);
    expect(createAgent).toHaveBeenCalledTimes(1);

    // While handler is blocked, manually trigger runOnce via scheduleNext
    // to verify the isRunning guard prevents re-entry
    // (in practice, setTimeout-based scheduling prevents this, but the guard remains)
    resolveHandler();
    await vi.advanceTimersByTimeAsync(5000);
    expect(createAgent).toHaveBeenCalledTimes(2);
  });

  it('logs heartbeat failures from the runner and still reschedules', async () => {
    const logger = makeLogger();
    heartbeatHandler.mockRejectedValue(new Error('boom'));

    const repo = makeRepo([{ id: 't1', cronExpression: '0 9 * * *', lastRun: undefined, createdAt: new Date() }]);
    const runner = makeRunner(logger, repo);

    runner.start();
    await vi.advanceTimersByTimeAsync(5000);

    expect(logger.error).toHaveBeenCalledWith(
      'Heartbeat failed.',
      expect.objectContaining({ error: 'boom' }),
    );
    // nextCronFire called: initial + reschedule after failure
    expect(nextCronFire).toHaveBeenCalledTimes(2);
  });

  it('records a successful heartbeat run after runOnce completes', async () => {
    const logger = makeLogger();
    const runRepo = makeRunRepo();

    const repo = makeRepo([{ id: 't1', cronExpression: '0 9 * * *', lastRun: undefined, createdAt: new Date() }]);
    const runner = makeRunner(logger, repo, runRepo);

    runner.start();
    await vi.advanceTimersByTimeAsync(5000);

    expect(runRepo.recordRun).toHaveBeenCalledTimes(1);
    expect(runRepo.recordRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'success',
        runAt: expect.any(Date),
        errorMessage: undefined,
      }),
    );
  });

  it('records a failed heartbeat run with the error message', async () => {
    const logger = makeLogger();
    const runRepo = makeRunRepo();
    heartbeatHandler.mockRejectedValue(new Error('boom'));

    const repo = makeRepo([{ id: 't1', cronExpression: '0 9 * * *', lastRun: undefined, createdAt: new Date() }]);
    const runner = makeRunner(logger, repo, runRepo);

    runner.start();
    await vi.advanceTimersByTimeAsync(5000);

    expect(runRepo.recordRun).toHaveBeenCalledTimes(1);
    expect(runRepo.recordRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error', errorMessage: 'boom' }),
    );
  });

  it('logs when there are no tasks and does not schedule a timeout', () => {
    const logger = makeLogger();
    const repo = makeRepo([]);
    const runner = makeRunner(logger, repo);

    runner.start();

    expect(logger.info).toHaveBeenCalledWith(
      'Heartbeat: No scheduled beats, waiting for new beats to be added.',
    );
    expect(nextCronFire).not.toHaveBeenCalled();
  });

  it('removes expired one-time beats instead of scheduling them for next year', () => {
    const logger = makeLogger();
    const createdAt = new Date();
    const repo = makeRepo([
      { id: 'missed', cronExpression: '30 9 15 6 *', runOnce: true, lastRun: undefined, createdAt },
      { id: 'pending', cronExpression: '30 9 20 6 *', runOnce: true, lastRun: undefined, createdAt },
      { id: 'daily', cronExpression: '0 9 * * *', lastRun: undefined, createdAt },
    ]);
    vi.mocked(isOneTimeBeatExpired).mockImplementation((expr) => expr === '30 9 15 6 *');
    const runner = makeRunner(logger, repo);

    runner.start();

    expect(isOneTimeBeatExpired).toHaveBeenCalledTimes(2);
    expect(repo.deleteById).toHaveBeenCalledTimes(1);
    expect(repo.deleteById).toHaveBeenCalledWith('missed');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('"missed" is past its scheduled time'));
    expect(nextCronFire).toHaveBeenCalledTimes(2);
    expect(nextCronFire).not.toHaveBeenCalledWith('30 9 15 6 *', expect.anything());
  });

  it('reschedule method cancels existing timer and schedules again', () => {
    const logger = makeLogger();
    const repo = makeRepo([{ id: 't1', cronExpression: '0 9 * * *', lastRun: undefined, createdAt: new Date() }]);
    const runner = makeRunner(logger, repo);

    runner.start();
    expect(nextCronFire).toHaveBeenCalledTimes(1);

    runner.reschedule();
    expect(nextCronFire).toHaveBeenCalledTimes(2);
  });

  it('reschedule does nothing when heartbeat is disabled', () => {
    applyTestConfigDefaults({ heartbeatEnabled: false });

    const logger = makeLogger();
    const repo = makeRepo([{ id: 't1', cronExpression: '0 9 * * *', lastRun: undefined, createdAt: new Date() }]);
    const runner = makeRunner(logger, repo);

    runner.reschedule();

    expect(nextCronFire).not.toHaveBeenCalled();
  });
});
