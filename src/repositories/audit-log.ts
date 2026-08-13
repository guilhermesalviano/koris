import { IDatabaseService } from '../infrastructure/db-sqlite';
import { AuditLog, AuditKind, AuditStatus } from '../entities/audit-log';
import { formatISO } from '../utils/date';

export interface AuditLogRow {
  id: string;
  run_id?: string;
  session_id?: string;
  channel?: string;
  kind: AuditKind;
  role: 'manager' | 'worker';
  agent_name?: string;
  provider?: string;
  model?: string;
  prompt?: string;
  prompt_length?: number;
  response?: string;
  response_length?: number;
  finish_reason?: string;
  tool_calls: number;
  tool_name?: string;
  tool_args?: string;
  success?: number;
  duration_ms: number;
  status: AuditStatus;
  error_code?: string;
  error_message?: string;
  created_at: string;
}

export interface AuditLogFilters {
  kind?: AuditKind;
  sessionId?: string;
  role?: 'manager' | 'worker';
  status?: AuditStatus;
  agentName?: string;
}

export interface AuditLogQuery {
  limit?: number;
  offset?: number;
  filters?: AuditLogFilters;
}

interface IAuditLogRepository {
  save(entry: AuditLog): void;
  findById(id: string): AuditLogRow | null;
  findAll(query?: AuditLogQuery): AuditLogRow[];
  count(filters?: AuditLogFilters): number;
  deleteById(id: string): boolean;
  deleteAll(): number;
}

function buildWhere(filters?: AuditLogFilters): { clause: string; params: unknown[] } {
  if (!filters) return { clause: '', params: [] };

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.kind) {
    conditions.push('kind = ?');
    params.push(filters.kind);
  }

  if (filters.sessionId) {
    conditions.push('session_id = ?');
    params.push(filters.sessionId);
  }

  if (filters.role) {
    conditions.push('role = ?');
    params.push(filters.role);
  }

  if (filters.status) {
    conditions.push('status = ?');
    params.push(filters.status);
  }

  if (filters.agentName) {
    conditions.push('agent_name = ?');
    params.push(filters.agentName);
  }

  return {
    clause: conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

class AuditLogRepository implements IAuditLogRepository {
  constructor(private db: IDatabaseService) {}

  save(entry: AuditLog): void {
    this.db.run(
      `INSERT INTO audit_logs (
        id, run_id, session_id, channel, kind, role, agent_name, provider, model,
        prompt, prompt_length, response, response_length, finish_reason, tool_calls,
        tool_name, tool_args, success, duration_ms, status, error_code, error_message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.runId ?? null,
        entry.sessionId ?? null,
        entry.channel ?? null,
        entry.kind,
        entry.role,
        entry.agentName ?? null,
        entry.kind === 'llm' ? entry.provider : null,
        entry.kind === 'llm' ? (entry.model ?? null) : null,
        entry.kind === 'llm' ? entry.prompt : null,
        entry.kind === 'llm' ? (entry.promptLength ?? null) : null,
        entry.response ?? null,
        entry.kind === 'llm' ? (entry.responseLength ?? null) : null,
        entry.kind === 'llm' ? (entry.finishReason ?? null) : null,
        entry.kind === 'llm' ? entry.toolCalls : 0,
        entry.kind === 'tool' ? entry.toolName : null,
        entry.kind === 'tool' ? (entry.toolArgs ?? null) : null,
        entry.kind === 'tool' ? (entry.success ? 1 : 0) : null,
        entry.durationMs,
        entry.status,
        entry.kind === 'llm' ? (entry.errorCode ?? null) : null,
        entry.errorMessage ?? null,
        formatISO(entry.createdAt),
      ],
    );
  }

  findById(id: string): AuditLogRow | null {
    const row = this.db.get<any>(`SELECT * FROM audit_logs WHERE id = ?`, [id]);
    return row ?? null;
  }

  findAll(query?: AuditLogQuery): AuditLogRow[] {
    const { clause, params } = buildWhere(query?.filters);
    const limit = query?.limit ?? 50;
    const offset = query?.offset ?? 0;

    params.push(limit, offset);

    return this.db.query<any>(
      `SELECT * FROM audit_logs${clause} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      params,
    );
  }

  count(filters?: AuditLogFilters): number {
    const { clause, params } = buildWhere(filters);
    const row = this.db.get<{ total: number }>(
      `SELECT COUNT(*) AS total FROM audit_logs${clause}`,
      params,
    );
    return row?.total ?? 0;
  }

  deleteById(id: string): boolean {
    const result = this.db.run(`DELETE FROM audit_logs WHERE id = ?`, [id]);
    return result.changes > 0;
  }

  deleteAll(): number {
    const result = this.db.run(`DELETE FROM audit_logs`);
    return result.changes;
  }
}

class AuditLogRepositoryFactory {
  private static instance: AuditLogRepository;

  static create(db: IDatabaseService): AuditLogRepository {
    if (!this.instance) {
      this.instance = new AuditLogRepository(db);
    }
    return this.instance;
  }

  static getInstance(): AuditLogRepository {
    if (!this.instance) {
      throw new Error('AuditLogRepository not initialized. Call create() first.');
    }
    return this.instance;
  }
}

export { IAuditLogRepository, AuditLogRepository, AuditLogRepositoryFactory };
