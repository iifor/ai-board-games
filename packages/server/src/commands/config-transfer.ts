import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { createDatabase } from '../db/database';
import { migrateToLatest } from '../db/migrate';
import { decodeConfig, exportConfig, importConfig } from '../modules/config-transfer/service';
import { ConfigTransferError } from '../modules/config-transfer/validator';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const environment = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_SCHEMA: z.string().regex(/^[a-z_][a-z0-9_]*$/).default('public'),
  SECRET_KEY: z.string().refine(v => Buffer.from(v, 'base64').length === 32),
  CONFIG_SOURCE_SECRET_KEY: z.string().refine(v => Buffer.from(v, 'base64').length === 32).optional(),
});

async function run() {
  const [operation, ...args] = process.argv.slice(2);
  const { values } = parseArgs({ args: args.filter(arg => arg !== '--'), options: {
    file: { type: 'string' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) {
    console.log('pnpm config:export --file artifacts/config.enc\npnpm config:import --file artifacts/config.enc\n文件路径相对项目根目录。导入使用目标 SECRET_KEY，源密钥不同时设置 CONFIG_SOURCE_SECRET_KEY。');
    return;
  }
  if (!['export', 'import'].includes(operation ?? '') || !values.file) {
    throw new ConfigTransferError('请指定 export / import 和 --file，或使用 --help 查看用法。');
  }
  const env = environment.parse(process.env);
  const key = Buffer.from(env.SECRET_KEY, 'base64');
  const sourceKey = Buffer.from(env.CONFIG_SOURCE_SECRET_KEY ?? env.SECRET_KEY, 'base64');
  const path = resolve(root, values.file);
  const content = operation === 'import' ? await readFile(path, 'utf8') : null;
  // 错密钥或无效文件在连接及初始化目标库前失败。
  if (content !== null) decodeConfig(content, sourceKey);
  const db = createDatabase({ url: env.DATABASE_URL, schema: env.DATABASE_SCHEMA, poolMax: 1 });
  try {
    if (content !== null) {
      await migrateToLatest(db, env.DATABASE_SCHEMA);
      const counts = await importConfig(db, content, sourceKey, key);
      console.log('配置导入完成', counts);
    } else {
      const result = await exportConfig(db, key);
      await mkdir(dirname(path), { recursive: true });
      // 独占创建避免覆盖已有导出包；POSIX 上仅当前用户可读写。
      const file = await open(path, 'wx', 0o600);
      try {
        try { await file.writeFile(result.content, 'utf8'); }
        finally { await file.close(); }
      } catch (error) { await unlink(path); throw error; }
      console.log('配置导出完成', { file: path, ...result.counts });
    }
  } finally { await db.destroy(); }
}

run().catch((error: unknown) => {
  if (error instanceof ConfigTransferError) console.error(error.message);
  else if (error instanceof z.ZodError) console.error('配置校验失败', error.issues.map(i => i.path.join('.')).join('、'));
  else if (error instanceof Error && 'code' in error && error.code === 'EEXIST') console.error('导出文件已存在，请使用新的文件名。');
  else console.error('配置迁移失败，请核对文件路径、数据库连接、数据库权限和迁移状态。');
  process.exitCode = 1;
});
