import { CamelCasePlugin, Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { AppConfig } from '../config/env';
import { logger } from '../utils/logger';
import type { Database } from './schema';

export type Db = Kysely<Database>;

const POOL_CONNECTION_TIMEOUT_MS = 15_000;

// numeric 列以 number 返回（温度等配置值精度足够）
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number(value));

export function createDatabase(config: AppConfig['database']): Db {
  const pool = new pg.Pool({
    connectionString: config.url,
    max: config.poolMax,
    // 连接池用满时取连接最多等这么久就报错，而不是让请求无限挂起
    connectionTimeoutMillis: POOL_CONNECTION_TIMEOUT_MS,
    options: `-c search_path=${config.schema}`,
  });
  // 数据库重启或切换时空闲连接会报错；不监听的话 pg 把它当未处理的 error 事件，整个进程退出。连接池会自行补建连接
  pool.on('error', (error) => logger.warn('数据库空闲连接出错', { error: error.message }));
  // 只转换列名；jsonb 中的键（如阶段 ID visits.guard_protect）必须原样保留
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
    plugins: [new CamelCasePlugin({ maintainNestedObjectKeys: true })],
  });
}
