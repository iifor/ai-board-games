import { Pool, TypeOverrides } from 'pg';
import type { QueryResultRow } from 'pg';
import type { ValidationDbExecutor } from '../validation/queries';

const CONNECTION_TIMEOUT_MS = 5_000;
const STATEMENT_TIMEOUT_MS = 30_000;

function validationTypeParsers(): TypeOverrides {
  const parsers = new TypeOverrides();
  parsers.setTypeParser(20, (value) => value);
  parsers.setTypeParser(114, (value) => JSON.parse(value) as unknown);
  parsers.setTypeParser(1184, (value) => new Date(value));
  parsers.setTypeParser(3802, (value) => JSON.parse(value) as unknown);
  return parsers;
}

export type ValidationTls = false | { rejectUnauthorized: true; ca?: string };

function tlsConfiguration(targetUrl: string): ValidationTls {
  try {
    return new URL(targetUrl).searchParams.get('sslmode')?.toLowerCase() === 'verify-full'
      ? { rejectUnauthorized: true }
      : false;
  } catch {
    return false;
  }
}

export function createValidationExecutor(
  targetUrl: string,
  schema: string,
  explicitTls?: ValidationTls,
): ValidationDbExecutor {
  const pool = new Pool({
    connectionString: targetUrl,
    max: 1,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    statement_timeout: STATEMENT_TIMEOUT_MS,
    ssl: explicitTls === undefined ? tlsConfiguration(targetUrl) : explicitTls,
    application_name: 'consensus-db-migrator-validation',
    options: `-c search_path=${schema},public -c default_transaction_read_only=on`,
    types: validationTypeParsers(),
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
