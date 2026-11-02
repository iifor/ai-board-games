import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { createPgListener, type BusTransport, type ListenerClient } from '../src/db/notifier';
import type { Logger } from '../src/utils/logger';
import { createPgEventBus, decodeBusNotification, encodeBusNotification, MAX_NOTIFICATION_BYTES } from '../src/utils/pgEventBus';

const silent: Logger = { info: () => {}, warn: () => {}, error: () => {} };

/** 一条共享"通道"：模拟同一个数据库上的多个实例，各自的传输层都连着它 */
function fakeChannel() {
  const subscribers = new Set<(payload: string) => void>();
  const sent: string[] = [];
  const transport = (): BusTransport => {
    const own = new Set<(payload: string) => void>();
    return {
      notify: async (payload) => {
        sent.push(payload);
        // NOTIFY 送达所有监听者，包括发送者自己
        for (const handler of subscribers) handler(payload);
      },
      onNotification: (handler) => {
        own.add(handler);
        subscribers.add(handler);
        return () => {
          own.delete(handler);
          subscribers.delete(handler);
        };
      },
      start: async () => {},
      stop: async () => {
        for (const handler of own) subscribers.delete(handler);
      },
    };
  };
  return { transport, sent, deliver: (payload: string) => subscribers.forEach((handler) => handler(payload)) };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('bus notification codec', () => {
  it('round-trips every event as a small { instance, event, payload } envelope', () => {
    const encoded = encodeBusNotification('inst-a', 'match:events', { matchId: 'm_1', lastSeq: 7 });
    expect(JSON.parse(encoded)).toEqual({ instance: 'inst-a', event: 'match:events', payload: { matchId: 'm_1', lastSeq: 7 } });
    expect(Buffer.byteLength(encoded)).toBeLessThan(MAX_NOTIFICATION_BYTES);
    expect(decodeBusNotification(encoded)).toEqual({ instance: 'inst-a', event: 'match:events', payload: { matchId: 'm_1', lastSeq: 7 } });
    expect(decodeBusNotification(encodeBusNotification('i', 'match:status', { matchId: 'm', status: 'failed' })))
      .toEqual({ instance: 'i', event: 'match:status', payload: { matchId: 'm', status: 'failed' } });
    expect(decodeBusNotification(encodeBusNotification('i', 'tasks:queued', { matchId: 'm' }))).toMatchObject({ event: 'tasks:queued' });
    expect(decodeBusNotification(encodeBusNotification('i', 'match:acked', { matchId: 'm', seq: 3 }))).toMatchObject({ payload: { seq: 3 } });
  });

  it('rejects anything that is not a well-formed notification', () => {
    expect(decodeBusNotification('not json')).toBeNull();
    expect(decodeBusNotification('{"instance":"i","event":"nope","payload":{}}')).toBeNull();
    expect(decodeBusNotification('{"instance":"i","event":"match:events","payload":{"matchId":"m"}}')).toBeNull();
    expect(decodeBusNotification('{"instance":"","event":"tasks:queued","payload":{"matchId":"m"}}')).toBeNull();
    expect(decodeBusNotification('[]')).toBeNull();
  });
});

describe('distributed event bus', () => {
  it('delivers locally once and to other instances once, dropping its own notification', async () => {
    const channel = fakeChannel();
    const a = createPgEventBus({ instanceId: 'a', transport: channel.transport(), logger: silent });
    const b = createPgEventBus({ instanceId: 'b', transport: channel.transport(), logger: silent });
    await a.start();
    await b.start();
    const onA: number[] = [];
    const onB: number[] = [];
    a.on('match:events', (payload) => onA.push(payload.lastSeq));
    b.on('match:events', (payload) => onB.push(payload.lastSeq));
    a.emit('match:events', { matchId: 'm_1', lastSeq: 1 });
    await flush();
    expect(onA).toEqual([1]);
    expect(onB).toEqual([1]);
    expect(channel.sent).toHaveLength(1);
    // 反向也一样
    b.emit('match:events', { matchId: 'm_1', lastSeq: 2 });
    await flush();
    expect(onA).toEqual([1, 2]);
    expect(onB).toEqual([1, 2]);
    await a.stop();
    await b.stop();
  });

  it('ignores garbage on the channel and keeps delivering locally when the transport fails', async () => {
    const channel = fakeChannel();
    const warnings: string[] = [];
    const logger: Logger = { ...silent, warn: (message) => warnings.push(message) };
    const failing: BusTransport = { ...channel.transport(), notify: async () => { throw new Error('连接池已关闭'); } };
    const bus = createPgEventBus({ instanceId: 'a', transport: failing, logger });
    const received: string[] = [];
    bus.on('tasks:queued', (payload) => received.push(payload.matchId));
    channel.deliver('{"broken');
    channel.deliver(encodeBusNotification('a', 'tasks:queued', { matchId: 'own' }));
    channel.deliver(encodeBusNotification('b', 'tasks:queued', { matchId: 'other' }));
    bus.emit('tasks:queued', { matchId: 'local' });
    await flush();
    expect(received).toEqual(['other', 'local']);
    expect(warnings).toEqual(['忽略无法解析的跨实例通知', '跨实例通知发送失败，其他实例由兜底轮询发现']);
  });

  it('does not send a payload above the NOTIFY limit and stops notifying after stop', async () => {
    const channel = fakeChannel();
    const warnings: string[] = [];
    const bus = createPgEventBus({ instanceId: 'a', transport: channel.transport(), logger: { ...silent, warn: (message) => warnings.push(message) } });
    bus.emit('match:status', { matchId: 'm', status: 'x'.repeat(MAX_NOTIFICATION_BYTES) });
    await flush();
    expect(channel.sent).toEqual([]);
    expect(warnings).toEqual(['跨实例通知过大，未发送']);
    await bus.stop();
    bus.emit('tasks:queued', { matchId: 'm' });
    await flush();
    expect(channel.sent).toEqual([]);
  });
});

/** 假的监听连接：可控的连接结果，记录执行过的语句，能模拟断线 */
class FakeClient extends EventEmitter implements ListenerClient {
  readonly queries: string[] = [];
  ended = false;
  constructor(private readonly failConnect: boolean) {
    super();
  }
  async connect(): Promise<void> {
    if (this.failConnect) throw new Error('connection refused');
  }
  async query(text: string): Promise<unknown> {
    this.queries.push(text);
    return undefined;
  }
  async end(): Promise<void> {
    this.ended = true;
    this.emit('end');
  }
  drop(): void {
    this.emit('error', new Error('server closed the connection unexpectedly'));
    this.emit('end');
  }
}

describe('pg listener', () => {
  it('listens on the quoted channel, hands over payloads and reconnects with backoff after a drop', async () => {
    const clients: FakeClient[] = [];
    const outcomes = [true, false, false, true];
    const listener = createPgListener({
      channel: 'battle_test_x',
      createClient: () => {
        const client = new FakeClient(!(outcomes.shift() ?? true));
        clients.push(client);
        return client;
      },
      backoff: { initialMs: 5, maxMs: 20 },
      logger: silent,
    });
    const payloads: string[] = [];
    listener.onNotification((payload) => payloads.push(payload));
    await listener.start();
    expect(listener.connected()).toBe(true);
    expect(clients[0]?.queries).toEqual(['listen "battle_test_x"']);
    clients[0]?.emit('notification', { channel: 'battle_test_x', payload: 'hello' });
    clients[0]?.emit('notification', { channel: 'other', payload: 'nope' });
    expect(payloads).toEqual(['hello']);

    // 断线：两次重连失败（5ms、10ms）后第四个连接成功，重新 LISTEN
    clients[0]?.drop();
    expect(listener.connected()).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(clients).toHaveLength(4);
    expect(listener.connected()).toBe(true);
    expect(clients[3]?.queries).toEqual(['listen "battle_test_x"']);
    clients[3]?.emit('notification', { channel: 'battle_test_x', payload: 'again' });
    expect(payloads).toEqual(['hello', 'again']);

    await listener.stop();
    expect(clients[3]?.ended).toBe(true);
    expect(listener.connected()).toBe(false);
    // 停止后不再重连
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(clients).toHaveLength(4);
  });

  it('does not fail start when the first connection is refused; it keeps retrying until it gets through', async () => {
    const clients: FakeClient[] = [];
    const listener = createPgListener({
      channel: 'battle_test_y',
      createClient: () => {
        const client = new FakeClient(clients.length < 2);
        clients.push(client);
        return client;
      },
      backoff: { initialMs: 5, maxMs: 5 },
      logger: silent,
    });
    await listener.start();
    expect(listener.connected()).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(listener.connected()).toBe(true);
    expect(clients).toHaveLength(3);
    await listener.stop();
  });
});
