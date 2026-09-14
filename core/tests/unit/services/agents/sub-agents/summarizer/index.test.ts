import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { summarizerSubAgent } from '../../../../../../src/services/agents/sub-agents/summarizer';
import { Summarizer } from '../../../../../../src/services/agents/sub-agents/summarizer/sub-agent';
import { TaskQueue } from '../../../../../../src/services/agents/sub-agents/queue/task-queue';
import { applyTestConfigDefaults } from '../../../../../helpers/test-config';

function makeServices() {
  return {
    logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
    db: {} as never,
    sessionManager: {} as never,
    completion: { complete: vi.fn() },
    createPromptRepository: vi.fn(),
    queue: new TaskQueue(1),
  };
}

const turn = { sessionId: 's1', channel: 'web', ask: 'hi', answer: 'hello', memoryService: { save: vi.fn() } as never };

describe('summarizerSubAgent', () => {
  beforeEach(() => {
    vi.spyOn(Summarizer.prototype, 'summarize').mockResolvedValue(undefined);
    vi.spyOn(Summarizer.prototype, 'compact').mockResolvedValue({ type: 'summary', content: 'compacted' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('summarizes a completed turn in auto mode', async () => {
    applyTestConfigDefaults({ summarizerMode: 'auto' });
    const { triggers } = summarizerSubAgent.create(makeServices() as never);

    await triggers?.onTurnComplete?.(turn);

    expect(Summarizer.prototype.summarize).toHaveBeenCalledWith(turn);
  });

  it('ignores completed turns in manual mode', async () => {
    applyTestConfigDefaults({ summarizerMode: 'manual' });
    const { triggers } = summarizerSubAgent.create(makeServices() as never);

    await triggers?.onTurnComplete?.(turn);

    expect(Summarizer.prototype.summarize).not.toHaveBeenCalled();
  });

  it('exposes compaction as its API and declares no other trigger', async () => {
    const { api, triggers } = summarizerSubAgent.create(makeServices() as never);

    await expect(api.compact({ sessionId: 's1', messages: [], channel: 'web', memoryService: {} as never })).resolves.toEqual({ type: 'summary', content: 'compacted' });
    expect(triggers?.schedule).toBeUndefined();
    expect(triggers?.routeInbound).toBeUndefined();
    expect(summarizerSubAgent.key).toMatchObject({ id: 'summarizer', listed: false, role: 'worker' });
  });
});
