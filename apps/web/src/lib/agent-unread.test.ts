import { describe, expect, it } from 'vitest';
import { hasUnreadActivity, latestActivity, parseAgentReadState } from './agent-unread';

describe('agent unread activity', () => {
  it('keeps read activity clear and flags only newer activity', () => {
    expect(hasUnreadActivity(0, undefined)).toBe(false);
    expect(hasUnreadActivity(100, undefined)).toBe(true);
    expect(hasUnreadActivity(100, 100)).toBe(false);
    expect(hasUnreadActivity(99, 100)).toBe(false);
    expect(hasUnreadActivity(101, 100)).toBe(true);
  });

  it('restores independent read positions and rejects invalid storage', () => {
    expect(parseAgentReadState('{"orchestrator":100,"watcher":200,"negotiator":"300"}')).toEqual({ orchestrator: 100, watcher: 200 });
    for (const value of [null, '{', 'null', '1', '{"watcher":-1}', '{"watcher":1e999}']) {
      expect(parseAgentReadState(value)).toEqual({});
    }
  });

  it('ignores invalid dates and older history when finding the latest activity', () => {
    expect(latestActivity([])).toBe(0);
    expect(latestActivity([100, NaN, 50, 200, Infinity])).toBe(200);
  });
});
