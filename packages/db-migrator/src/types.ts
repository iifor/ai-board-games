export interface TableReport { sourceRows: number; targetRows: number; importedRows: number }
export interface MigrationReport {
  status: 'succeeded' | 'failed';
  sourcePath: string;
  targetSchema: string;
  startedAt: string;
  durationMs: number;
  tables: Record<string, TableReport>;
  skippedTables: string[];
  errors: string[];
  validation: 'passed' | 'failed';
}

export interface MigrationOptions {
  sourcePath: string;
  targetUrl: string;
  targetSchema?: string;
}

export interface MigrationQueryResult<T extends object> {
  rows: T[];
  rowCount: number | null;
}

export interface MigrationClient {
  connect(): Promise<void>;
  query<T extends object>(sql: string, values?: readonly unknown[]): Promise<MigrationQueryResult<T>>;
  end(): Promise<void>;
}

export interface MigrationDependencies {
  createClient(options: MigrationOptions): Promise<MigrationClient>;
}
