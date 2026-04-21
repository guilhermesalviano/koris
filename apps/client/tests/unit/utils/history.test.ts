import { describe, it, expect } from 'vitest';
import { isSkillAlreadyLearned } from '../../../src/utils/history';
import { Message } from '../../../src/entities/message';

function msg(role: 'system' | 'user' | 'assistant', content: string): Message {
  return new Message({ sessionId: 's1', role, content });
}

describe('isSkillAlreadyLearned', () => {
  it('returns false for empty history', () => {
    expect(isSkillAlreadyLearned('weather', [])).toBe(false);
  });

  it('returns false when skill name is not in any message', () => {
    const history = [msg('system', 'You are a helpful assistant.')];
    expect(isSkillAlreadyLearned('weather', history)).toBe(false);
  });

  it('returns true when skill name appears in a system message', () => {
    const history = [msg('system', 'You have just learned how to use "weather" skill.')];
    expect(isSkillAlreadyLearned('weather', history)).toBe(true);
  });

  it('returns false when skill name appears only in a user message', () => {
    const history = [msg('user', 'I want to use the weather skill')];
    expect(isSkillAlreadyLearned('weather', history)).toBe(false);
  });

  it('returns false when skill name appears only in an assistant message', () => {
    const history = [msg('assistant', 'I used the weather skill for you.')];
    expect(isSkillAlreadyLearned('weather', history)).toBe(false);
  });

  it('returns true when skill appears in one of multiple system messages', () => {
    const history = [
      msg('system', 'General system context.'),
      msg('user', 'Hello'),
      msg('system', 'Skill: weather-api - docs here'),
    ];
    expect(isSkillAlreadyLearned('weather-api', history)).toBe(true);
  });

  it('is case-sensitive', () => {
    const history = [msg('system', 'Skill WEATHER loaded.')];
    expect(isSkillAlreadyLearned('weather', history)).toBe(false);
  });
});
