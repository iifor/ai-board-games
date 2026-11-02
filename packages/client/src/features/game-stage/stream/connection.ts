import type { ClientMessage, ServerMessage } from '@battle/shared';
import { CONNECTION_LOST_MESSAGE } from '../constants';
import type { StreamState } from '../types';
import { reconnectDelay } from './reconnect';

/** 连接只用到 WebSocket 的这几个成员；测试用假对象替换 */
export interface StreamSocket {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(type: 'open' | 'close', listener: () => void): void;
  addEventListener(type: 'message', listener: (event: { readonly data: unknown }) => void): void;
}

export type SocketFactory = (url: string) => StreamSocket;

/** WebSocket.OPEN */
const SOCKET_OPEN = 1;
const openSocket: SocketFactory = (url) => new WebSocket(url);

export const INITIAL_STREAM_STATE: StreamState = { items: [], status: null, ended: false, result: null, error: null, connection: 'connecting' };

/**
 * 对局播放流的连接：连上即发 hello 续播，按 seq 去重地累积事件，事件播放完 ack；
 * 断线后按 reconnectDelay 退避重连，连续失败到上限则停下并报错，由用户手动重试；
 * 收到 end / error / status: failed 后不再重连。状态对象每次整体替换，供 React 订阅。
 */
export class MatchStreamConnection {
  #state = INITIAL_STREAM_STATE;
  #socket: StreamSocket | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;
  /** 最后播放完的 seq：hello 从它之后续播，服务端把它当作确认，断线期间没发出去的 ack 由此补上 */
  #playedSeq = 0;
  /** 连续失败次数：收到服务端对 hello 的任何回应即清零 */
  #failures = 0;
  #ended = false;
  #disposed = false;
  readonly #url: string;
  readonly #createSocket: SocketFactory;
  readonly #listeners = new Set<() => void>();

  constructor(url: string, createSocket: SocketFactory = openSocket) {
    this.#url = url;
    this.#createSocket = createSocket;
    this.#connect();
  }

  get state(): StreamState {
    return this.#state;
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /** 事件播放完：记下已播到哪里；连接着就立即 ack，断着则由下一次 hello 带上 */
  ack(seq: number): void {
    this.#playedSeq = Math.max(this.#playedSeq, seq);
    if (this.#socket?.readyState === SOCKET_OPEN) this.#send({ type: 'ack', seq });
  }

  /** 手动重试：清零失败计数，立即重连 */
  retry(): void {
    if (this.#disposed || this.#ended || this.#socket) return;
    this.#clearTimer();
    this.#failures = 0;
    this.#update({ error: null, connection: 'connecting' });
    this.#connect();
  }

  dispose(): void {
    this.#disposed = true;
    this.#clearTimer();
    const socket = this.#socket;
    this.#socket = null;
    socket?.close();
  }

  #connect(): void {
    const socket = this.#createSocket(this.#url);
    this.#socket = socket;
    socket.addEventListener('open', () => {
      if (this.#socket !== socket) return;
      this.#update({ connection: 'open' });
      this.#send({ type: 'hello', afterSeq: this.#playedSeq });
    });
    socket.addEventListener('message', (event) => {
      if (this.#socket !== socket) return;
      this.#failures = 0;
      this.#handle(JSON.parse(String(event.data)) as ServerMessage);
    });
    socket.addEventListener('close', () => {
      if (this.#socket !== socket) return;
      this.#socket = null;
      this.#afterClose();
    });
  }

  #afterClose(): void {
    if (this.#disposed) return;
    if (this.#ended) {
      this.#update({ connection: 'closed' });
      return;
    }
    this.#failures += 1;
    const delay = reconnectDelay(this.#failures);
    if (delay === null) {
      this.#update({ connection: 'lost', error: CONNECTION_LOST_MESSAGE });
      return;
    }
    this.#update({ connection: 'connecting' });
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.#connect();
    }, delay);
  }

  #handle(message: ServerMessage): void {
    if (message.type === 'event') {
      const last = this.#state.items[this.#state.items.length - 1]?.event.seq ?? 0;
      if (message.event.seq <= last) return;
      this.#update({ items: [...this.#state.items, { event: message.event, audio: message.audio }] });
    } else if (message.type === 'end') {
      this.#ended = true;
      this.#update({ ended: true, result: message.result, status: 'completed' });
    } else if (message.type === 'status') {
      if (message.status === 'failed') this.#ended = true;
      this.#update({ status: message.status, error: message.error, ended: this.#state.ended || message.status === 'failed' });
    } else {
      this.#ended = true;
      this.#update({ error: message.message, ended: true });
    }
  }

  #send(message: ClientMessage): void {
    this.#socket?.send(JSON.stringify(message));
  }

  #clearTimer(): void {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
  }

  #update(patch: Partial<StreamState>): void {
    this.#state = { ...this.#state, ...patch };
    for (const listener of this.#listeners) listener();
  }
}
