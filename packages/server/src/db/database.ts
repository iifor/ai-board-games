import { CamelCasePlugin, Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { AppConfig } from '../config/env';
import type { Database } from './schema';

export type Db = Kysely<Database>;

// numeric 列以 number 返回（温度等配置值精度足够）
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number(value));

export function createDatabase(config: AppConfig['database']): Db {
  const pool = new pg.Pool({
    connectionString: config.url,
    max: config.poolMax,
    options: `-c search_path=${config.schema}`,
  });
  // 只转换列名；jsonb 中的键（如阶段 ID visits.guard_protect）必须原样保留
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
    plugins: [new CamelCasePlugin({ maintainNestedObjectKeys: true })],
  });
}
