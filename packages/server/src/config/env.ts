import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3100),
  DATABASE_URL: z.string().min(1, '必须配置 DATABASE_URL'),
  DATABASE_SCHEMA: z.string().regex(/^[a-z_][a-z0-9_]*$/, 'DATABASE_SCHEMA 只能包含小写字母、数字和下划线').default('public'),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET 至少 32 个字符'),
  SECRET_KEY: z.string().refine((value) => Buffer.from(value, 'base64').length === 32, 'SECRET_KEY 必须是 32 字节随机数的 base64'),
  ADMIN_USERNAME: z.string().trim().min(3).max(32).optional(),
  ADMIN_PASSWORD: z.string().min(12, 'ADMIN_PASSWORD 至少 12 个字符').optional(),
});

export interface AppConfig {
  readonly env: 'development' | 'test' | 'production';
  readonly port: number;
  readonly database: { readonly url: string; readonly schema: string; readonly poolMax: number };
  readonly jwtSecret: string;
  readonly secretKey: Buffer;
  /** 管理员表为空时用于创建首个账号 */
  readonly bootstrapAdmin: { readonly username: string; readonly password: string } | null;
}

export class ConfigError extends Error {
  constructor(issues: readonly string[]) {
    super(`配置无效：\n- ${issues.join('\n- ')}`);
    this.name = 'ConfigError';
  }
}

/** 读取并校验环境变量；错误信息只包含字段名与规则，不包含取值 */
export function loadConfig(env: Readonly<Record<string, string | undefined>> = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(parsed.error.issues.map((issue) => `${issue.path.join('.')}：${issue.message}`));
  }
  const value = parsed.data;
  const bootstrapAdmin = value.ADMIN_USERNAME && value.ADMIN_PASSWORD
    ? { username: value.ADMIN_USERNAME, password: value.ADMIN_PASSWORD }
    : null;
  return {
    env: value.NODE_ENV,
    port: value.PORT,
    database: { url: value.DATABASE_URL, schema: value.DATABASE_SCHEMA, poolMax: value.DATABASE_POOL_MAX },
    jwtSecret: value.JWT_SECRET,
    secretKey: Buffer.from(value.SECRET_KEY, 'base64'),
    bootstrapAdmin,
  };
}
