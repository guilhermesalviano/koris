import { describe, it, expect, vi } from 'vitest';
import { LearnedSkillsRepository, LearnedSkillsRepositoryFactory } from '../../../src/repositories/learned-skills';

function makeDb() {
  return { run: vi.fn(), get: vi.fn(), query: vi.fn() };
}

describe('LearnedSkillsRepository', () => {
  it('save inserts a new skill and returns it', () => {
    const db = makeDb();
    const skill = { id: 'skill_1', skill_name: 'git', skill_content: 'use rebase', learned_at: 't' };
    db.get.mockReturnValueOnce(undefined).mockReturnValue(skill);
    const repository = new LearnedSkillsRepository(db as never);

    const result = repository.save({ skill_name: 'git', skill_content: 'use rebase' });

    expect(db.run).toHaveBeenCalledTimes(1);
    const [sql, params] = db.run.mock.calls[0];
    expect(sql).toContain('INSERT INTO learned_skills');
    expect(params[0]).toMatch(/^skill_/);
    expect(params[1]).toBe('git');
    expect(params[2]).toBe('use rebase');
    expect(result).toEqual(skill);
  });

  it('save skips inserting when the skill already exists', () => {
    const db = makeDb();
    const existing = { id: 'skill_existing', skill_name: 'git', skill_content: 'x', learned_at: 't' };
    db.get.mockReturnValue(existing);
    const repository = new LearnedSkillsRepository(db as never);

    const result = repository.save({ skill_name: 'git', skill_content: 'new' });

    expect(db.run).not.toHaveBeenCalled();
    expect(result).toEqual(existing);
  });

  it('save throws when the inserted skill cannot be retrieved', () => {
    const db = makeDb();
    db.get.mockReturnValue(undefined);
    const repository = new LearnedSkillsRepository(db as never);

    expect(() => repository.save({ skill_name: 'git', skill_content: 'x' })).toThrow(
      'Failed to retrieve saved skill',
    );
  });

  it('getById returns the skill or null', () => {
    const db = makeDb();
    const skill = { id: 's1', skill_name: 'a', skill_content: 'c', learned_at: 't' };
    db.get.mockReturnValueOnce(skill);
    const repository = new LearnedSkillsRepository(db as never);

    expect(repository.getById('s1')).toEqual(skill);
    expect(db.get).toHaveBeenCalledWith('SELECT * FROM learned_skills WHERE id = ?', ['s1']);

    db.get.mockReturnValueOnce(undefined);
    expect(repository.getById('missing')).toBeNull();
  });

  it('getByName returns the skill or null', () => {
    const db = makeDb();
    db.get.mockReturnValueOnce(undefined);
    const repository = new LearnedSkillsRepository(db as never);

    expect(repository.getByName('a')).toBeNull();
    expect(db.get).toHaveBeenCalledWith('SELECT * FROM learned_skills WHERE skill_name = ?', ['a']);

    db.get.mockReturnValueOnce({ id: 's1', skill_name: 'a', skill_content: 'c', learned_at: 't' });
    expect(repository.getByName('a')?.id).toBe('s1');
  });

  it('exists returns true only when the count is greater than zero', () => {
    const db = makeDb();
    db.get.mockReturnValueOnce({ count: 3 });
    const repository = new LearnedSkillsRepository(db as never);

    expect(repository.exists('a')).toBe(true);
    expect(db.get).toHaveBeenCalledWith('SELECT COUNT(*) as count FROM learned_skills WHERE skill_name = ?', ['a']);

    db.get.mockReturnValueOnce({ count: 0 });
    expect(repository.exists('b')).toBe(false);
  });

  it('exists returns false when no count row is returned', () => {
    const db = makeDb();
    db.get.mockReturnValue(undefined);
    const repository = new LearnedSkillsRepository(db as never);

    expect(repository.exists('a')).toBe(false);
  });

  it('getAll returns all skills ordered by learned_at', () => {
    const db = makeDb();
    const skills = [{ id: 's1', skill_name: 'a', skill_content: 'c', learned_at: 't' }];
    db.query.mockReturnValue(skills);
    const repository = new LearnedSkillsRepository(db as never);

    expect(repository.getAll()).toEqual(skills);
    expect(db.query.mock.calls[0][0]).toContain('ORDER BY learned_at DESC');
  });

  it('getRecent applies the limit', () => {
    const db = makeDb();
    db.query.mockReturnValue([]);
    const repository = new LearnedSkillsRepository(db as never);

    repository.getRecent(5);

    expect(db.query.mock.calls[0][0]).toContain('LIMIT ?');
    expect(db.query.mock.calls[0][1]).toEqual([5]);
  });

  it('deleteByName returns true when rows changed', () => {
    const db = makeDb();
    db.run.mockReturnValueOnce({ changes: 1 });
    const repository = new LearnedSkillsRepository(db as never);

    expect(repository.deleteByName('a')).toBe(true);
    expect(db.run).toHaveBeenCalledWith('DELETE FROM learned_skills WHERE skill_name = ?', ['a']);

    db.run.mockReturnValueOnce({ changes: 0 });
    expect(repository.deleteByName('b')).toBe(false);
    expect(db.run).toHaveBeenCalledWith('DELETE FROM learned_skills WHERE skill_name = ?', ['b']);
  });

  it('deleteAll returns the number of deleted rows', () => {
    const db = makeDb();
    db.run.mockReturnValue({ changes: 4 });
    const repository = new LearnedSkillsRepository(db as never);

    expect(repository.deleteAll()).toBe(4);
    expect(db.run).toHaveBeenCalledWith('DELETE FROM learned_skills');
  });

  it('rethrows when getById fails', () => {
    const db = makeDb();
    db.get.mockImplementation(() => {
      throw new Error('db error');
    });
    const repository = new LearnedSkillsRepository(db as never);

    expect(() => repository.getById('s1')).toThrow('db error');
  });

  it('rethrows when getByName fails', () => {
    const db = makeDb();
    db.get.mockImplementation(() => {
      throw new Error('db error');
    });
    const repository = new LearnedSkillsRepository(db as never);

    expect(() => repository.getByName('git')).toThrow('db error');
  });

  it('rethrows when exists fails', () => {
    const db = makeDb();
    db.get.mockImplementation(() => {
      throw new Error('db error');
    });
    const repository = new LearnedSkillsRepository(db as never);

    expect(() => repository.exists('git')).toThrow('db error');
  });

  it('rethrows when getAll fails', () => {
    const db = makeDb();
    db.query.mockImplementation(() => {
      throw new Error('db error');
    });
    const repository = new LearnedSkillsRepository(db as never);

    expect(() => repository.getAll()).toThrow('db error');
  });

  it('rethrows when getRecent fails', () => {
    const db = makeDb();
    db.query.mockImplementation(() => {
      throw new Error('db error');
    });
    const repository = new LearnedSkillsRepository(db as never);

    expect(() => repository.getRecent()).toThrow('db error');
  });

  it('rethrows when save fails', () => {
    const db = makeDb();
    db.run.mockImplementation(() => {
      throw new Error('insert failed');
    });
    const repository = new LearnedSkillsRepository(db as never);

    expect(() => repository.save({ skill_name: 'git', skill_content: 'x' })).toThrow('insert failed');
  });

  it('rethrows when deleteByName fails', () => {
    const db = makeDb();
    db.run.mockImplementation(() => {
      throw new Error('db error');
    });
    const repository = new LearnedSkillsRepository(db as never);

    expect(() => repository.deleteByName('git')).toThrow('db error');
  });

  it('rethrows when deleteAll fails', () => {
    const db = makeDb();
    db.run.mockImplementation(() => {
      throw new Error('db error');
    });
    const repository = new LearnedSkillsRepository(db as never);

    expect(() => repository.deleteAll()).toThrow('db error');
  });

  it('factory getInstance throws before create is called', () => {
    expect(() => LearnedSkillsRepositoryFactory.getInstance()).toThrow('not initialized');
  });

  it('factory getInstance returns the created instance', () => {
    const db = makeDb();
    const instance = LearnedSkillsRepositoryFactory.create(db as never);

    expect(LearnedSkillsRepositoryFactory.getInstance()).toBe(instance);
  });
});
