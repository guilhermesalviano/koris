import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from '../config';
import { LoggerFactory } from './logger';

const logger = LoggerFactory.create();

interface DatabaseOptions {
  filepath?: string;
  verbose?: boolean;
  timeout?: number;
}

interface QueryResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

interface Row {
  [key: string]: unknown;
}

interface IDatabaseService {
  query<T extends Row = Row>(sql: string, params?: unknown[]): T[];
  get<T extends Row = Row>(sql: string, params?: unknown[]): T | undefined;
  run(sql: string, params?: unknown[]): QueryResult;
  transaction<T>(fn: () => T): T;
  exec(sql: string): void;
  getStats(): Record<string, unknown>;
  close(): void;
  vacuum(): void;
  backup(targetPath: string): void;
}

class DatabaseService implements IDatabaseService {
  private db: Database.Database;
  private filepath: string;
  private verbose: boolean;

  constructor(options: DatabaseOptions = {}) {
    this.filepath = options.filepath || path.join(config.BASE_DIR, 'temp', 'database.db');
    this.verbose = options.verbose ?? config.ENVIRONMENT === 'development';
    
    try {
      fs.mkdirSync(path.dirname(this.filepath), { recursive: true });

      this.db = new Database(this.filepath, {
        timeout: options.timeout || 5000,
        fileMustExist: false,
      });

      this.db.pragma('foreign_keys = ON');

      if (this.verbose) {
        this.db.pragma('journal_mode = WAL');
        logger.debug(`SQLite initialized at ${this.filepath}`);
      }

      this.initializeSchema();
    } catch (error) {
      logger.error('Failed to initialize database', { error, filepath: this.filepath });
      throw error;
    }
  }

  /**
   * Initialize database schema with all required tables
   */
  private initializeSchema(): void {
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          source TEXT NOT NULL CHECK(source IN ('tui', 'web', 'telegram')),
          started_at DATETIME,
          ended_at DATETIME,
          message_count INTEGER DEFAULT 0,
          metadata TEXT
        );
      `);

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
          content TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        );
      `);

      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
        CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
      `);

      logger.debug('Database schema initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize database schema', { error });
      throw error;
    }
  }

  /**
   * Execute a query and return results
   */
  query<T extends Row = Row>(sql: string, params?: unknown[]): T[] {
    try {
      const stmt = this.db.prepare(sql);
      const rows = stmt.all(...(params || [])) as T[];
      return rows;
    } catch (error) {
      logger.error('Query execution failed', { sql, error });
      throw error;
    }
  }

  /**
   * Get a single row
   */
  get<T extends Row = Row>(sql: string, params?: unknown[]): T | undefined {
    try {
      const stmt = this.db.prepare(sql);
      const row = stmt.get(...(params || [])) as T | undefined;
      return row;
    } catch (error) {
      logger.error('Get query failed', { sql, error });
      throw error;
    }
  }

  /**
   * Execute a statement (INSERT, UPDATE, DELETE)
   */
  run(sql: string, params?: unknown[]): QueryResult {
    try {
      const stmt = this.db.prepare(sql);
      const info = stmt.run(...(params || []));
      return {
        changes: info.changes,
        lastInsertRowid: info.lastInsertRowid,
      };
    } catch (error) {
      logger.error('Run query failed', { sql, error });
      throw error;
    }
  }

  /**
   * Start a transaction
   */
  transaction<T>(fn: () => T): T {
    const transaction = this.db.transaction(fn);
    return transaction();
  }

  /**
   * Execute multiple statements in a transaction
   */
  exec(sql: string): void {
    try {
      this.db.exec(sql);
    } catch (error) {
      logger.error('Exec failed', { sql, error });
      throw error;
    }
  }

  /**
   * Get database statistics
   */
  getStats(): Record<string, unknown> {
    try {
      const pageCount = this.db.pragma('page_count');
      const pageSize = this.db.pragma('page_size');
      const journalMode = this.db.pragma('journal_mode');

      const tableStats = this.query<{ name: string; type: string }>(
        "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'index')"
      );

      return {
        filepath: this.filepath,
        pageCount,
        pageSize,
        journalMode,
        totalSize: (pageCount as number) * (pageSize as number),
        tables: tableStats.length,
      };
    } catch (error) {
      logger.error('Failed to get database stats', { error });
      return {};
    }
  }

  /**
   * Close the database connection
   */
  close(): void {
    try {
      this.db.close();
      logger.info('Database connection closed');
    } catch (error) {
      logger.error('Failed to close database', { error });
    }
  }

  /**
   * Vacuum (optimize) the database
   */
  vacuum(): void {
    try {
      this.db.exec('VACUUM;');
      logger.info('Database vacuumed successfully');
    } catch (error) {
      logger.error('Failed to vacuum database', { error });
    }
  }

  /**
   * Backup database to file
   */
  backup(targetPath: string): void {
    try {
      this.db.exec(`VACUUM INTO '${targetPath}';`);
      logger.info('Database backed up', { targetPath });
    } catch (error) {
      logger.error('Failed to backup database', { error, targetPath });
      throw error;
    }
  }
}

class DatabaseServiceFactory {
  static create(options?: DatabaseOptions): DatabaseService {
    return new DatabaseService(options);
  }
}

export { DatabaseServiceFactory, IDatabaseService };