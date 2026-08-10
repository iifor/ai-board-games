export type DbRow = Record<string, unknown>;
export type DbParams = readonly unknown[];

export interface ExecuteResult {
  rowCount: number;
}

export interface TransactionOptions {
  isolationLevel?: 'read committed' | 'repeatable read' | 'serializable';
  maxRetries?: number;
}

export interface DbExecutor {
  queryOne<T extends object>(sql: string, params?: DbParams): Promise<T | null>;
  queryMany<T extends object>(sql: string, params?: DbParams): Promise<T[]>;
  execute(sql: string, params?: DbParams): Promise<ExecuteResult>;
  withTransaction<T>(
    operation: (transaction: DbExecutor) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T>;
  healthCheck(): Promise<boolean>;
  close(): Promise<void>;
}
