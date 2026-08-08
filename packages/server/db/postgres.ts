import { Pool, types } from 'pg';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import type { DatabaseConfig } from './config';
import type { DbExecutor, DbParams, DbRow, ExecuteResult, TransactionOptions } from './types';

type QueryTarget = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;

const RETRYABLE_TRANSACTION_CODES = new Set([
  '08000',
  '08001',
  '08003',
  '08004',
  '08006',
  '40001',
  '40P01',
  '57P01',
]);

// Preserve the repository contracts used throughout the existing application.
types.setTypeParser(20, (value) => Number(value));
types.setTypeParser(114, (value) => value);
types.setTypeParser(1184, (value) => value);
types.setTypeParser(3802, (value) => value);

function isRetryableTransactionError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && RETRYABLE_TRANSACTION_CODES.has(code);
}

class PostgresExecutor implements DbExecutor {
  constructor(
    private readonly pool: Pool,
    private readonly client: PoolClient | null = null,
  ) {}

  private get target(): QueryTarget {
    return this.client || this.pool;
  }

  async queryOne<T extends object>(sql: string, params: DbParams = []): Promise<T | null> {
    const result = await this.target.query<T & QueryResultRow>(sql, [...params]);
    return result.rows[0] || null;
  }

  async queryMany<T extends object>(sql: string, params: DbParams = []): Promise<T[]> {
    const result = await this.target.query<T & QueryResultRow>(sql, [...params]);
    return result.rows;
  }

  async execute(sql: string, params: DbParams = []): Promise<ExecuteResult> {
    const result = await this.target.query(sql, [...params]) as QueryResult<QueryResultRow>;
    return { rowCount: result.rowCount || 0 };
  }

  async withTransaction<T>(
    operation: (transaction: DbExecutor) => Promise<T>,
    options: TransactionOptions = {},
  ): Promise<T> {
    if (this.client) return operation(this);

    const maxRetries = options.maxRetries ?? 2;
    for (let attempt = 0; ; attempt += 1) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        if (options.isolationLevel) {
          await client.query(`SET TRANSACTION ISOLATION LEVEL ${options.isolationLevel.toUpperCase()}`);
        }
        const value = await operation(new PostgresExecutor(this.pool, client));
        await client.query('COMMIT');
        return value;
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Preserve the original transaction failure.
        }
        if (attempt >= maxRetries || !isRetryableTransactionError(error)) throw error;
      } finally {
        client.release();
      }
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.target.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    if (!this.client) await this.pool.end();
  }
}

function createPostgresExecutor(config: DatabaseConfig): PostgresExecutor {
  const pool = new Pool({
    connectionString: config.connectionString,
    max: config.poolMax,
    connectionTimeoutMillis: config.connectionTimeoutMs,
    statement_timeout: config.statementTimeoutMs,
    ssl: config.ssl,
    application_name: 'consensus-server',
    options: `-c search_path=${config.schema},public`,
  });
  return new PostgresExecutor(pool);
}

export { PostgresExecutor, createPostgresExecutor, isRetryableTransactionError };
