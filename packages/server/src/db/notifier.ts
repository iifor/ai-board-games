import { sql } from 'kysely';
import pg from 'pg';
import { errorMessage } from '../utils/errors';
import { logger as defaultLogger, type Logger } from '../utils/logger';
import type { Db } from './database';

// 跨实例通知的传输层：NOTIFY 走连接池；LISTEN 必须占用一条专用连接（连接池里的连接会被回收，收不到通知）。
// NOTIFY 的通道是整个数据库范围的，通道名里带上 schema，同一个库里不同 schema 的部署（以及并行的测试）互不串扰。

/** 监听连接需要的最小能力；pg.Client 直接满足，测试里用假实现 */
export interface ListenerClient {
  connect(): Promise<unknown>;
  query(text: string): Promise<unknown>;
  end(): Promise<void>;
  on(event: 'notification', listener: (message: { readonly channel: string; readonly payload?: string | undefined }) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  on(event: 'end', listener: () => void): unknown;
}

/** 跨实例通知的收发能力；事件总线只依赖这个接口 */
export interface BusTransport {
  notify(payload: string): Promise<void>;
  onNotification(handler: (payload: string) => void): () => void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface ListenerOptions {
  readonly channel: string;
  readonly createClient: () => ListenerClient;
  /** 重连退避：从 initialMs 起每次翻倍，封顶 maxMs */
  readonly backoff?: { readonly initialMs: number; readonly maxMs: number } | undefined;
  readonly logger?: Logger | undefined;
}

export function notifyChannel(schema: string): string {
  return `battle_${schema}`;
}

/** LISTEN 的通道名是标识符，按标识符规则引用 */
function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/**
 * 专用连接上的 LISTEN：连接断开时按退避重连，期间本进程的事件照常投递，其他实例的事件靠兜底轮询发现。
 * start 等待第一次连接完成；失败不抛错，记日志后转入重连，服务不因此起不来。
 */
export function createPgListener(options: ListenerOptions) {
  const log = options.logger ?? defaultLogger;
  const backoff = options.backoff ?? { initialMs: 500, maxMs: 10_000 };
  const handlers = new Set<(payload: string) => void>();
  let current: ListenerClient | null = null;
  let timer: NodeJS.Timeout | null = null;
  let failures = 0;
  let stopped = false;

  async function connect(): Promise<void> {
    const client = options.createClient();
    client.on('notification', (message) => {
      if (message.channel !== options.channel || message.payload === undefined) return;
      for (const handler of handlers) handler(message.payload);
    });
    client.on('error', (error) => log.warn('通知监听连接出错', { channel: options.channel, error: error.message }));
    client.on('end', () => {
      if (current !== client) return;
      current = null;
      if (stopped) return;
      log.warn('通知监听连接断开，准备重连', { channel: options.channel });
      scheduleReconnect();
    });
    try {
      await client.connect();
      await client.query(`listen ${quoteIdentifier(options.channel)}`);
    } catch (error) {
      await client.end().catch((endError: unknown) => log.warn('关闭失败的监听连接出错', { error: errorMessage(endError) }));
      throw error;
    }
    current = client;
    if (failures) log.info('通知监听已重连', { channel: options.channel, attempts: failures });
    failures = 0;
  }

  function scheduleReconnect(): void {
    if (stopped || timer) return;
    const delayMs = Math.min(backoff.initialMs * 2 ** failures, backoff.maxMs);
    failures += 1;
    timer = setTimeout(() => {
      timer = null;
      connect().catch((error: unknown) => {
        log.error('重连通知监听失败', { channel: options.channel, attempt: failures, error: errorMessage(error) });
        scheduleReconnect();
      });
    }, delayMs);
    timer.unref();
  }

  return {
    onNotification(handler: (payload: string) => void): () => void {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    async start(): Promise<void> {
      stopped = false;
      try {
        await connect();
      } catch (error) {
        log.error('通知监听连接失败，先靠兜底轮询，稍后重连', { channel: options.channel, error: errorMessage(error) });
        scheduleReconnect();
      }
    },
    async stop(): Promise<void> {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      const client = current;
      current = null;
      if (client) await client.end();
    },
    /** 测试用：当前是否有活跃的监听连接 */
    connected: (): boolean => current !== null,
  };
}

export interface NotifierOptions {
  readonly db: Db;
  readonly schema: string;
  readonly connectionString: string;
  readonly logger?: Logger | undefined;
}

/** PostgreSQL LISTEN/NOTIFY 传输层：发送走连接池（pg_notify），接收走专用监听连接 */
export function createPgNotifier(options: NotifierOptions): BusTransport {
  const channel = notifyChannel(options.schema);
  const listener = createPgListener({
    channel,
    createClient: () => new pg.Client({ connectionString: options.connectionString }),
    logger: options.logger,
  });
  return {
    notify: async (payload) => {
      await sql`select pg_notify(${channel}, ${payload})`.execute(options.db);
    },
    onNotification: listener.onNotification,
    start: listener.start,
    stop: listener.stop,
  };
}
