import { z } from 'zod';
import type { BusTransport } from '../db/notifier';
import { createEventBus, type BusEvents, type EventBus } from './eventBus';
import { errorMessage } from './errors';
import { logger as defaultLogger, type Logger } from './logger';

/** PostgreSQL NOTIFY 的载荷上限是 8000 字节；超过的通知不发（其他实例由兜底轮询发现） */
export const MAX_NOTIFICATION_BYTES = 7900;

/** 跨实例通知：带上发送实例的 ID，收到自己发的就丢掉，本地监听者不会收到两次 */
export type BusNotification = {
  [K in keyof BusEvents]: { readonly instance: string; readonly event: K; readonly payload: BusEvents[K] };
}[keyof BusEvents];

const notificationSchema = z.discriminatedUnion('event', [
  z.object({ instance: z.string().min(1), event: z.literal('match:events'), payload: z.object({ matchId: z.string(), lastSeq: z.number().int() }) }),
  z.object({ instance: z.string().min(1), event: z.literal('match:status'), payload: z.object({ matchId: z.string(), status: z.string() }) }),
  z.object({ instance: z.string().min(1), event: z.literal('tasks:queued'), payload: z.object({ matchId: z.string() }) }),
  z.object({ instance: z.string().min(1), event: z.literal('match:acked'), payload: z.object({ matchId: z.string(), seq: z.number().int() }) }),
]) satisfies z.ZodType<BusNotification>;

export function encodeBusNotification<K extends keyof BusEvents>(instance: string, event: K, payload: BusEvents[K]): string {
  return JSON.stringify({ instance, event, payload });
}

/** 解析失败返回 null：通道里只应有本服务各实例发的通知，但不信任任何原始字符串 */
export function decodeBusNotification(raw: string): BusNotification | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = notificationSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

export interface DistributedEventBus extends EventBus {
  readonly instanceId: string;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface PgEventBusOptions {
  readonly transport: BusTransport;
  /** 启动时生成的随机 ID，用于丢掉自己发出的通知 */
  readonly instanceId: string;
  readonly logger?: Logger | undefined;
}

/**
 * 跨实例事件总线：emit 先投递给本进程的监听者，再通过传输层 NOTIFY 其他实例；
 * 收到其他实例的通知就投递给本地监听者。传输层不可用时本地投递不受影响，播放流与 worker 的兜底轮询补上空档。
 */
export function createPgEventBus(options: PgEventBusOptions): DistributedEventBus {
  const local = createEventBus();
  const log = options.logger ?? defaultLogger;
  let stopped = false;
  const unsubscribe = options.transport.onNotification((raw) => {
    const message = decodeBusNotification(raw);
    if (!message) {
      log.warn('忽略无法解析的跨实例通知', { bytes: Buffer.byteLength(raw, 'utf8') });
      return;
    }
    if (message.instance === options.instanceId) return;
    local.emit(message.event, message.payload);
  });

  return {
    instanceId: options.instanceId,
    on: (name, listener) => local.on(name, listener),
    emit(name, payload) {
      local.emit(name, payload);
      // 关闭后连接池随即销毁，不再往外发；本地投递照常
      if (stopped) return;
      const encoded = encodeBusNotification(options.instanceId, name, payload);
      const bytes = Buffer.byteLength(encoded, 'utf8');
      if (bytes > MAX_NOTIFICATION_BYTES) {
        log.warn('跨实例通知过大，未发送', { event: name, bytes });
        return;
      }
      options.transport.notify(encoded).catch((error: unknown) => {
        log.warn('跨实例通知发送失败，其他实例由兜底轮询发现', { event: name, error: errorMessage(error) });
      });
    },
    start: () => options.transport.start(),
    async stop(): Promise<void> {
      stopped = true;
      unsubscribe();
      await options.transport.stop();
    },
  };
}
