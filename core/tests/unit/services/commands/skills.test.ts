import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { config } from '../../../../src/config';

const getRecent = vi.fn();

vi.mock('../../../../src/infrastructure/db-sqlite', () => ({
  DatabaseServiceFactory: { create: () => ({}) },
}));

vi.mock('../../../../src/repositories/learned-skills', () => ({
  LearnedSkillsRepositoryFactory: { create: () => ({ getRecent }) },
}));

import { isSkillCommand, listSkillCommands, listSkills, resolveSkillCommand } from '../../../../src/services/commands/skills';

const originalMode = config.SKILLS.MODE;

function setMode(mode: 'auto' | 'manual') {
  (config.SKILLS as { MODE: string }).MODE = mode;
}

beforeEach(() => {
  getRecent.mockReset();
  getRecent.mockReturnValue([
    { name: 'cat-fact', description: 'Random cat facts', content: 'Call catfact.ninja.' },
    { name: 'weather', description: 'Forecasts', content: 'Call wttr.in.' },
  ]);
  setMode('manual');
});

afterEach(() => {
  setMode(originalMode);
});

describe('resolveSkillCommand', () => {
  it('resolves the short form and keeps the rest of the message as args', () => {
    expect(resolveSkillCommand('/weather Rio de Janeiro')).toEqual({
      name: 'weather',
      content: 'Call wttr.in.',
      args: 'Rio de Janeiro',
    });
  });

  it('resolves the explicit /skill form', () => {
    expect(resolveSkillCommand('/skill cat-fact tell me one')).toEqual({
      name: 'cat-fact',
      content: 'Call catfact.ninja.',
      args: 'tell me one',
    });
  });

  it('resolves a bare invocation with empty args', () => {
    expect(resolveSkillCommand('/cat-fact')).toMatchObject({ name: 'cat-fact', args: '' });
    expect(resolveSkillCommand('/skill cat-fact')).toMatchObject({ name: 'cat-fact', args: '' });
  });

  it('is case-insensitive on the skill name', () => {
    expect(resolveSkillCommand('/Weather Rio')).toMatchObject({ name: 'weather', args: 'Rio' });
  });

  it('returns null for an unknown skill', () => {
    expect(resolveSkillCommand('/nope do a thing')).toBeNull();
    expect(resolveSkillCommand('/skill nope')).toBeNull();
  });

  it('returns null for a skill that is not enabled', () => {
    // getRecent only ever returns enabled rows, so a disabled skill is simply absent.
    getRecent.mockReturnValue([{ name: 'weather', description: 'Forecasts', content: 'Call wttr.in.' }]);
    expect(resolveSkillCommand('/cat-fact')).toBeNull();
  });

  it('returns null in auto mode, so the message flows to the agent unchanged', () => {
    setMode('auto');
    expect(resolveSkillCommand('/weather Rio')).toBeNull();
    expect(getRecent).not.toHaveBeenCalled();
  });

  it('ignores non-command text and paths', () => {
    expect(resolveSkillCommand('weather Rio')).toBeNull();
    expect(resolveSkillCommand('')).toBeNull();
    expect(resolveSkillCommand('/path/to/file.ts')).toBeNull();
    expect(resolveSkillCommand('/skill')).toBeNull();
  });

  it('respects the configured skill limit', () => {
    resolveSkillCommand('/weather');
    expect(getRecent).toHaveBeenCalledWith(config.SKILLS.LIMIT);
  });
});

describe('isSkillCommand', () => {
  it('mirrors resolveSkillCommand', () => {
    expect(isSkillCommand('/cat-fact')).toBe(true);
    expect(isSkillCommand('/nope')).toBe(false);

    setMode('auto');
    expect(isSkillCommand('/cat-fact')).toBe(false);
  });
});

describe('listSkills', () => {
  it('reports every enabled skill in manual mode', () => {
    expect(listSkills()).toEqual([
      { name: 'cat-fact', description: 'Random cat facts' },
      { name: 'weather', description: 'Forecasts' },
    ]);
  });

  it('reports them in auto mode too, unlike listSkillCommands', () => {
    setMode('auto');

    expect(listSkills()).toEqual([
      { name: 'cat-fact', description: 'Random cat facts' },
      { name: 'weather', description: 'Forecasts' },
    ]);
    expect(listSkillCommands()).toEqual([]);
  });

  it('respects the configured limit', () => {
    listSkills();
    expect(getRecent).toHaveBeenCalledWith(config.SKILLS.LIMIT);
  });

  it('is empty when nothing is enabled', () => {
    getRecent.mockReturnValue([]);
    expect(listSkills()).toEqual([]);
  });
});

describe('listSkillCommands', () => {
  it('summarizes the enabled skills in manual mode', () => {
    expect(listSkillCommands()).toEqual([
      { name: 'cat-fact', description: 'Random cat facts' },
      { name: 'weather', description: 'Forecasts' },
    ]);
  });

  it('is empty in auto mode', () => {
    setMode('auto');
    expect(listSkillCommands()).toEqual([]);
  });
});
