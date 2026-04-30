import { IDatabaseService } from '../infrastructure/db-sqlite';
import { Heartbeat } from '../entities/heartbeat';

interface UpdateHeartbeatInput {
  task?: string;
  cronExpression?: string;
}

interface IHeartbeatRepository {
  save(heartbeat: Heartbeat): void;
  getById(id: string): Heartbeat | null;
  getAll(): Heartbeat[];
  update(id: string, input: UpdateHeartbeatInput): Heartbeat | null;
  deleteById(id: string): boolean;
  deleteAll(): number;
}

class HeartbeatRepository implements IHeartbeatRepository {
  constructor(private db: IDatabaseService) {}

  save(heartbeat: Heartbeat): void {
    this.db.run(
      `INSERT INTO heartbeat (id, task, cron_expression, last_run, created_at) VALUES (?, ?, ?, ?, ?)`,
      [
        heartbeat.id,
        heartbeat.task,
        heartbeat.cronExpression,
        heartbeat.lastRun?.toISOString() ?? null,
        heartbeat.createdAt.toISOString(),
      ],
    );
  }

  getById(id: string): Heartbeat | null {
    const row = this.db.get<any>(`SELECT * FROM heartbeat WHERE id = ?`, [id]);
    return row ? this.mapRow(row) : null;
  }

  getAll(): Heartbeat[] {
    const rows = this.db.query<any>(`SELECT * FROM heartbeat ORDER BY created_at DESC`);
    return rows.map(this.mapRow);
  }

  update(id: string, input: UpdateHeartbeatInput): Heartbeat | null {
    const fields: string[] = [];
    const params: unknown[] = [];

    if (input.task !== undefined) {
      fields.push('task = ?');
      params.push(input.task);
    }

    if (input.cronExpression !== undefined) {
      fields.push('cron_expression = ?');
      params.push(input.cronExpression);
    }

    if (fields.length === 0) return this.getById(id);

    params.push(id);
    this.db.run(`UPDATE heartbeat SET ${fields.join(', ')} WHERE id = ?`, params);

    return this.getById(id);
  }

  updateLastRun(id: string, lastRun: Date): void {
    this.db.run(`UPDATE heartbeat SET last_run = ? WHERE id = ?`, [lastRun.toISOString(), id]);
  }

  deleteById(id: string): boolean {
    const result = this.db.run(`DELETE FROM heartbeat WHERE id = ?`, [id]);
    return result.changes > 0;
  }

  deleteAll(): number {
    const result = this.db.run(`DELETE FROM heartbeat`);
    return result.changes;
  }

  private mapRow(row: any): Heartbeat {
    return new Heartbeat({
      id: row.id,
      task: row.task,
      cronExpression: row.cron_expression,
      lastRun: row.last_run ? new Date(row.last_run) : undefined,
      createdAt: new Date(row.created_at),
    });
  }
}

class HeartbeatRepositoryFactory {
  private static instance: HeartbeatRepository;

  static create(db: IDatabaseService): HeartbeatRepository {
    if (!this.instance) {
      this.instance = new HeartbeatRepository(db);
    }
    return this.instance;
  }

  static getInstance(): HeartbeatRepository {
    if (!this.instance) {
      throw new Error('HeartbeatRepository not initialized. Call create() first.');
    }
    return this.instance;
  }
}

export { IHeartbeatRepository, HeartbeatRepositoryFactory, UpdateHeartbeatInput };
