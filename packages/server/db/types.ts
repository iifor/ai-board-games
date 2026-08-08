type DbRow = Record<string, unknown>;
type DbParams = readonly unknown[];

interface ExecuteResult {
  rowCount: number;
}

interface TransactionOptions {
  isolationLevel?: 'read committed' | 'repeatable read' | 'serializable';
  maxRetries?: number;
}

interface DbExecutor {
  queryOne<T extends DbRow>(sql: string, params?: DbParams): Promise<T | null>;
  queryMany<T extends DbRow>(sql: string, params?: DbParams): Promise<T[]>;
  execute(sql: string, params?: DbParams): Promise<ExecuteResult>;
  withTransaction<T>(
    operation: (transaction: DbExecutor) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T>;
  healthCheck(): Promise<boolean>;
  close(): Promise<void>;
}

export type { DbExecutor, DbParams, DbRow, ExecuteResult, TransactionOptions };
