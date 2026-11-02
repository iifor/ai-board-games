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
  AZURE_SPEECH_KEY: z.string().min(1).optional(),
  AZURE_SPEECH_REGION: z.string().min(1).optional(),
  MIMO_API_KEY: z.string().min(1).optional(),
  MIMO_BASE_URL: z.url().default('https://api.xiaomimimo.com/v1'),
  MIMO_TTS_MODEL: z.string().min(1).default('mimo-v2.5-tts'),
  /** 同时执行的 AI 任务数 */
  AI_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(4),
  /** 一个 AI 任务最多领取几次：执行或推进反复失败时终止对局，不再无限重试、重复付费调用模型 */
  AI_TASK_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(3),
  /** 播放流等待新事件时的兜底重查间隔（毫秒）：跨实例通知经 LISTEN/NOTIFY 即时送达，这是监听连接重连期间丢失通知时的安全网 */
  STREAM_POLL_MS: z.coerce.number().int().min(100).max(60_000).default(2000),
  /** C 端同时进行中的公开对局上限 */
  MAX_ACTIVE_MATCHES: z.coerce.number().int().min(1).max(1000).default(5),
  /** 公开对局多少分钟无人确认视为无人观看：不再计入进行中数量，并由回收器结束 */
  MATCH_IDLE_MINUTES: z.coerce.number().int().min(1).max(1440).default(30),
  /** 只有部署在可信反向代理之后才读取 X-Forwarded-For 作为限流来源 */
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  /** 优雅关闭时最多等待进行中的 AI 任务多少毫秒；超时后直接退出，未完成任务的领取过期后由下一个实例重新领取 */
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(0).max(600_000).default(10_000),
});

export interface AppConfig {
  readonly env: 'development' | 'test' | 'production';
  readonly port: number;
  readonly database: { readonly url: string; readonly schema: string; readonly poolMax: number };
  readonly jwtSecret: string;
  readonly secretKey: Buffer;
  /** 管理员表为空时用于创建首个账号 */
  readonly bootstrapAdmin: { readonly username: string; readonly password: string } | null;
  readonly tts: {
    readonly azure: { readonly key: string; readonly region: string } | null;
    readonly mimo: { readonly apiKey: string; readonly baseUrl: string; readonly model: string } | null;
  };
  readonly ai: { readonly concurrency: number; readonly maxAttempts: number };
  readonly matches: { readonly maxActive: number; readonly idleMs: number };
  readonly realtime: { readonly pollMs: number };
  readonly http: { readonly trustProxy: boolean };
  readonly shutdown: { readonly timeoutMs: number };
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
    tts: {
      azure: value.AZURE_SPEECH_KEY && value.AZURE_SPEECH_REGION ? { key: value.AZURE_SPEECH_KEY, region: value.AZURE_SPEECH_REGION } : null,
      mimo: value.MIMO_API_KEY ? { apiKey: value.MIMO_API_KEY, baseUrl: value.MIMO_BASE_URL, model: value.MIMO_TTS_MODEL } : null,
    },
    ai: { concurrency: value.AI_CONCURRENCY, maxAttempts: value.AI_TASK_MAX_ATTEMPTS },
    matches: { maxActive: value.MAX_ACTIVE_MATCHES, idleMs: value.MATCH_IDLE_MINUTES * 60_000 },
    realtime: { pollMs: value.STREAM_POLL_MS },
    http: { trustProxy: value.TRUST_PROXY === 'true' },
    shutdown: { timeoutMs: value.SHUTDOWN_TIMEOUT_MS },
  };
}
