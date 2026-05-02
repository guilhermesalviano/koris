import { IDatabaseService } from '../infrastructure/db-sqlite';

interface LearnedSkill {
  id: string;
  skill_name: string;
  skill_content: string;
  learned_at: string;
  [key: string]: unknown;
}

interface CreateLearnedSkillInput {
  skill_name: string;
  skill_content: string;
}

interface ILearnedSkillsRepository {
  save(input: CreateLearnedSkillInput): LearnedSkill;
  getById(id: string): LearnedSkill | null;
  getByName(skillName: string): LearnedSkill | null;
  exists(skillName: string): boolean;
  getAll(): LearnedSkill[];
  getRecent(limit?: number): LearnedSkill[];
  deleteByName(skillName: string): boolean;
  deleteAll(): number;
}

class LearnedSkillsRepository implements ILearnedSkillsRepository {
  constructor(
    private db: IDatabaseService,
  ) {}

  /**
   * Save a newly learned skill with learning context
   */
  save(input: CreateLearnedSkillInput): LearnedSkill {
    try {
      if (this.getByName(input.skill_name)) {
        // this.logger.info(`Skill "${input.skill_name}" already learned, skipping save`, { skillName: input.skill_name });
        return this.getByName(input.skill_name) as LearnedSkill;
      }
      const id = `skill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      this.db.run(
        `INSERT INTO learned_skills 
          (id, skill_name, skill_content, learned_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
        [id, input.skill_name, input.skill_content]
      );

      // this.logger.info('Learned skill saved', { skillName: input.skill_name, id });

      const skill = this.getById(id);
      if (!skill) {
        throw new Error(`Failed to retrieve saved skill: ${id}`);
      }

      return skill;
    } catch (error) {
      // this.logger.error('Failed to save learned skill', {
      //   skillName: input.skill_name,
      //   error: error instanceof Error ? error.message : String(error),
      // });
      throw error;
    }
  }

  /**
   * Get learned skill by ID
   */
  getById(id: string): LearnedSkill | null {
    try {
      const skill = this.db.get<LearnedSkill>(
        'SELECT * FROM learned_skills WHERE id = ?',
        [id]
      );
      return skill || null;
    } catch (error) {
      // this.logger.error('Failed to get learned skill by ID', { id, error });
      throw error;
    }
  }

  /**
   * Get learned skill by name
   */
  getByName(skillName: string): LearnedSkill | null {
    try {
      const skill = this.db.get<LearnedSkill>(
        'SELECT * FROM learned_skills WHERE skill_name = ?',
        [skillName]
      );
      return skill || null;
    } catch (error) {
      // this.logger.error('Failed to get learned skill by name', { skillName, error });
      throw error;
    }
  }

  /**
   * Check if skill has been learned
   */
  exists(skillName: string): boolean {
    try {
      const skill = this.db.get<{ count: number }>(
        'SELECT COUNT(*) as count FROM learned_skills WHERE skill_name = ?',
        [skillName]
      );
      return (skill?.count ?? 0) > 0;
    } catch (error) {
      // this.logger.error('Failed to check if skill exists', { skillName, error });
      throw error;
    }
  }

  /**
   * Get all learned skills
   */
  getAll(): LearnedSkill[] {
    try {
      return this.db.query<LearnedSkill>(
        'SELECT * FROM learned_skills ORDER BY learned_at DESC'
      );
    } catch (error) {
      // this.logger.error('Failed to get all learned skills', { error });
      throw error;
    }
  }

  /**
   * Get recently learned skills
   */
  getRecent(limit: number = 10): LearnedSkill[] {
    try {
      return this.db.query<LearnedSkill>(
        'SELECT * FROM learned_skills ORDER BY learned_at DESC LIMIT ?',
        [limit]
      );
    } catch (error) {
      // this.logger.error('Failed to get recent learned skills', { error });
      throw error;
    }
  }

  /**
   * Delete learned skill by name
   */
  deleteByName(skillName: string): boolean {
    try {
      const result = this.db.run(
        'DELETE FROM learned_skills WHERE skill_name = ?',
        [skillName]
      );
      
      if (result.changes > 0) {
        // this.logger.info('Learned skill deleted', { skillName });
        return true;
      }
      return false;
    } catch (error) {
      // this.logger.error('Failed to delete learned skill', { skillName, error });
      throw error;
    }
  }

  /**
   * Clear all learned skills
   */
  deleteAll(): number {
    try {
      const result = this.db.run('DELETE FROM learned_skills');
      // this.logger.info('All learned skills cleared', { count: result.changes });
      return result.changes;
    } catch (error) {
      // this.logger.error('Failed to clear learned skills', { error });
      throw error;
    }
  }
}

/**
 * Factory for creating LearnedSkillsRepository singleton
 */
class LearnedSkillsRepositoryFactory {
  private static instance: LearnedSkillsRepository;

  static create(db: IDatabaseService): LearnedSkillsRepository {
    if (!this.instance) {
      this.instance = new LearnedSkillsRepository(db);
    }
    return this.instance;
  }

  static getInstance(): LearnedSkillsRepository {
    if (!this.instance) {
      throw new Error('LearnedSkillsRepository not initialized. Call create() first.');
    }
    return this.instance;
  }
}

export { ILearnedSkillsRepository, LearnedSkillsRepository, LearnedSkillsRepositoryFactory }
