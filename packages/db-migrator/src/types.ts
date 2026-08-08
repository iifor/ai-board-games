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
