import type { AddressInfo } from 'node:net';
import { serve, type ServerType } from '@hono/node-server';
import type { ServerMessage, StageEvent } from '@battle/shared';
import type { TestApp } from './testApp';

export interface Watched {
  readonly events: StageEvent[];
  readonly audio: (string | null)[];
  readonly end: ServerMessage | null;
}

/** 在随机端口上监听一个实例的 HTTP 与 WebSocket，返回端口与关闭方法 */
export async function listen(t: TestApp): Promise<{ port: number; close(): Promise<void> }> {
  const server: ServerType = serve({ fetch: t.app.fetch, port: 0 });
  t.injectWebSocket(server);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  return {
    port: (server.address() as AddressInfo).port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** 连接对局流并逐个确认，直到收到 end 或达到 limit 个事件 */
export function watch(port: number, matchId: string, afterSeq: number, limit = Number.POSITIVE_INFINITY, timeoutMs = 60_000): Promise<Watched> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/api/toc/ws/matches/${matchId}`);
    const events: StageEvent[] = [];
    const audio: (string | null)[] = [];
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`观看超时：收到 ${events.length} 个事件`));
    }, timeoutMs);
    const finish = (end: ServerMessage | null) => {
      clearTimeout(timer);
      socket.close();
      resolve({ events, audio, end });
    };
    socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'hello', afterSeq })));
    socket.addEventListener('error', () => reject(new Error('WebSocket 出错')));
    socket.addEventListener('message', (message) => {
      const data = JSON.parse(String(message.data)) as ServerMessage;
      if (data.type === 'event') {
        events.push(data.event);
        audio.push(data.audio?.url ?? null);
        if (events.length >= limit) return finish(null);
        socket.send(JSON.stringify({ type: 'ack', seq: data.event.seq }));
      } else if (data.type === 'end' || data.type === 'error' || (data.type === 'status' && data.status === 'failed')) {
        finish(data);
      }
    });
  });
}
