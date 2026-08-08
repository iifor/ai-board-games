import fs from 'fs';

interface DatabaseConfig {
  connectionString: string;
  schema: string;
  poolMax: number;
  connectionTimeoutMs: number;
  statementTimeoutMs: number;
  ssl: false | { rejectUnauthorized: true; ca?: string };
}

type DatabaseEnvironment = Record<string, string | undefined>;

function readPositiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function readDatabaseConfig(environment: DatabaseEnvironment = process.env): DatabaseConfig {
  const connectionString = environment.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const schema = environment.DATABASE_SCHEMA?.trim() || 'consensus';
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) {
    throw new Error('DATABASE_SCHEMA must be a lowercase PostgreSQL identifier');
  }

  const sslEnabled = ['1', 'true', 'require', 'verify-full'].includes(
    environment.DATABASE_SSL?.trim().toLowerCase() || '',
  );
  const caPath = environment.DATABASE_CA_PATH?.trim();

  return {
    connectionString,
    schema,
    poolMax: readPositiveInteger(environment.DATABASE_POOL_MAX, 10, 'DATABASE_POOL_MAX'),
    connectionTimeoutMs: readPositiveInteger(
      environment.DATABASE_CONNECTION_TIMEOUT_MS,
      5_000,
      'DATABASE_CONNECTION_TIMEOUT_MS',
    ),
    statementTimeoutMs: readPositiveInteger(
      environment.DATABASE_STATEMENT_TIMEOUT_MS,
      30_000,
      'DATABASE_STATEMENT_TIMEOUT_MS',
    ),
    ssl: sslEnabled
      ? {
          rejectUnauthorized: true,
          ...(caPath ? { ca: fs.readFileSync(caPath, 'utf8') } : {}),
        }
      : false,
  };
}

export { readDatabaseConfig };
export type { DatabaseConfig, DatabaseEnvironment };
