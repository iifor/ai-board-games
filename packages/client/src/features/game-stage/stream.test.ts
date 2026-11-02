import type { ServerMessage } from '@battle/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONNECTION_LOST_MESSAGE } from './constants';
import { meta } from './stage.fixtures';
import { MatchStreamConnection, type StreamSocket } from './stream/connection';
import { reconnectDelay } from './stream/reconnect';

/** 假 WebSocket：由测试手动触发 open / message / close */
class FakeSocket implements StreamSocket {
  static instances: FakeSocket[] = [];
  readyState = 0;
  readonly sent: unknown[] = [];
  readonly listeners = new Map<string, ((event: { readonly data: unknown }) => void)[]>();
  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }
  addEventListener(type: 'open' | 'close' | 'message', listener: (event: { readonly data: unknown }) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
    this.emit('close');
  }
  open() {
    this.readyState = 1;
    this.emit('open');
  }
  receive(message: ServerMessage) {
    this.emit('message', JSON.stringify(message));
  }
  /** 连接意外断开 */
  drop() {
    this.readyState = 3;
    this.emit('close');
  }
  emit(type: string, data: unknown = undefined) {
    for (const listener of this.listeners.get(type) ?? []) listener({ data });
  }
}

const factory = (url: string) => new FakeSocket(url);
const event = (seq: number): ServerMessage => ({ type: 'event', event: { ...meta, seq, kind: 'narration', text: `第${seq}段` }, audio: null });
const socketAt = (index: number) => {
  const socket = FakeSocket.instances[index];
  if (!socket) throw new Error(`没有第 ${index + 1} 个连接`);
  return socket;
};

describe('reconnectDelay', () => {
  it('doubles from 1 s, caps at 15 s and gives up after the failure limit', () => {
    expect([1, 2, 3, 4, 5].map(reconnectDelay)).toEqual([1000, 2000, 4000, 8000, 15000]);
    expect(reconnectDelay(6)).toBeNull();
    expect(reconnectDelay(7)).toBeNull();
  });
});

describe('MatchStreamConnection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.instances = [];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends hello with the last played seq, so an ack made while disconnected is carried by the reconnect', async () => {
    const connection = new MatchStreamConnection('ws://x/stream', factory);
    const changes = vi.fn();
    connection.subscribe(changes);
    const first = socketAt(0);
    first.open();
    expect(connection.state.connection).toBe('open');
    expect(first.sent).toEqual([{ type: 'hello', afterSeq: 0 }]);
    first.receive(event(1));
    first.receive(event(2));
    first.receive(event(3));
    expect(connection.state.items.map((item) => item.event.seq)).toEqual([1, 2, 3]);
    connection.ack(1);
    expect(first.sent).toContainEqual({ type: 'ack', seq: 1 });

    first.drop();
    expect(connection.state.connection).toBe('connecting');
    connection.ack(2);
    await vi.advanceTimersByTimeAsync(1000);
    const second = socketAt(1);
    second.open();
    // 带的是播放到的 2，不是收到过的 3
    expect(second.sent).toEqual([{ type: 'hello', afterSeq: 2 }]);
    second.receive(event(3));
    expect(connection.state.items).toHaveLength(3);
    connection.ack(3);
    expect(second.sent).toContainEqual({ type: 'ack', seq: 3 });
    expect(changes).toHaveBeenCalled();
    connection.dispose();
  });

  it('backs off 1, 2, 4, 8, 15 s, then stops with an error until retried by hand', async () => {
    const connection = new MatchStreamConnection('ws://x/stream', factory);
    socketAt(0).drop();
    expect(connection.state.connection).toBe('connecting');
    for (const [index, delay] of [1000, 2000, 4000, 8000, 15000].entries()) {
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(FakeSocket.instances).toHaveLength(index + 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(FakeSocket.instances).toHaveLength(index + 2);
      socketAt(index + 1).drop();
    }
    expect(connection.state.connection).toBe('lost');
    expect(connection.state.error).toBe(CONNECTION_LOST_MESSAGE);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.instances).toHaveLength(6);

    connection.retry();
    expect(connection.state).toMatchObject({ connection: 'connecting', error: null });
    const revived = socketAt(6);
    revived.open();
    revived.receive({ type: 'status', status: 'running', error: null });
    // 服务端回应过 hello，失败计数清零：再断线从 1 秒重新开始
    revived.drop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(FakeSocket.instances).toHaveLength(8);
    connection.dispose();
  });

  it('does not reconnect once the stream has ended or the match failed', async () => {
    const ended = new MatchStreamConnection('ws://x/stream', factory);
    const first = socketAt(0);
    first.open();
    first.receive({ type: 'end', result: null });
    first.drop();
    expect(ended.state).toMatchObject({ ended: true, status: 'completed', connection: 'closed' });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
    ended.retry();
    expect(FakeSocket.instances).toHaveLength(1);

    const failed = new MatchStreamConnection('ws://x/stream', factory);
    const second = socketAt(1);
    second.open();
    second.receive({ type: 'status', status: 'failed', error: '模型额度用完' });
    second.drop();
    expect(failed.state).toMatchObject({ ended: true, error: '模型额度用完', connection: 'closed' });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it('closes the socket and cancels the pending reconnect when disposed', async () => {
    const connection = new MatchStreamConnection('ws://x/stream', factory);
    socketAt(0).drop();
    connection.dispose();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.instances).toHaveLength(1);

    const live = new MatchStreamConnection('ws://x/stream', factory);
    const socket = socketAt(1);
    socket.open();
    live.dispose();
    expect(socket.readyState).toBe(3);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.instances).toHaveLength(2);
  });
});
