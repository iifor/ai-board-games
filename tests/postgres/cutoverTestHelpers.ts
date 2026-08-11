import { randomBytes } from 'node:crypto';

interface ProductionUrlOverrides {
  database?: string;
  host?: string;
  port?: number;
  role?: string;
}

export function productionDatabaseUrl(overrides: ProductionUrlOverrides = {}): string {
  const url = new URL('postgresql://unused.invalid');
  url.username = overrides.role ?? 'consensus_migrator';
  url.password = randomBytes(24).toString('base64url');
  url.hostname = overrides.host ?? 'postgres';
  url.port = String(overrides.port ?? 5432);
  url.pathname = `/${overrides.database ?? 'consensus'}`;
  return url.toString();
}

export function productionTlsEnvironment(caPath: string): Record<string, string> {
  return { DATABASE_SSL: 'verify-full', DATABASE_CA_PATH: caPath };
}
