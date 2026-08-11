import { Pool, TypeOverrides } from 'pg';
import type { QueryResultRow } from 'pg';
import type { ValidationDbExecutor } from '../validation/queries';

function typeParsers(): TypeOverrides {
  const parsers = new TypeOverrides();
  parsers.setTypeParser(20, (value) => value);
  parsers.setTypeParser(114, (value) => JSON.parse(value) as unknown);
  parsers.setTypeParser(1184, (value) => new Date(value));
  parsers.setTypeParser(3802, (value) => JSON.parse(value) as unknown);
  return parsers;
}

export function createCutoverValidationExecutor(
  targetUrl: string,
  schema: string,
  ca: string,
): ValidationDbExecutor {
  const pool = new Pool({
    connectionString: targetUrl,
    max: 1,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 30_000,
    ssl: { ca, rejectUnauthorized: true },
    application_name: 'consensus-db-migrator-validation',
    options: `-c search_path=${schema},public -c default_transaction_read_only=on`,
    types: typeParsers(),
  });
  return {
    queryOne: async <T extends object>(sql: string, params = []): Promise<T | null> => {
      const result = await pool.query<T & QueryResultRow>(sql, [...params]);
      return result.rows[0] || null;
    },
    queryMany: async <T extends object>(sql: string, params = []): Promise<T[]> => {
      const result = await pool.query<T & QueryResultRow>(sql, [...params]);
      return result.rows;
    },
    close: () => pool.end(),
  };
}
