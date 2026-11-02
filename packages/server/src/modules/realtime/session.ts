import type { GameResult, MatchStatus, StageEvent } from '@battle/shared';
import type { EventBus } from '../../utils/eventBus';
import { logger } from '../../utils/logger';
import { PREFETCH_EVENTS, TERMINAL_STATUSES } from '../matches/types';
import type { AudioResolver } from './audio';
import { encode, type StreamSocket } from './protocol';

/** 播放流只需要对局的这几个字段 */
export interface StreamMatch {
  readonly status: MatchStatus;
  readonly scripted: boolean;
  readonly result: GameResult | null;
  readonly error: string | null;
}

export interface StreamDeps {
  readonly matches: {
    find(id: string): Promise<StreamMatch | undefined>;
    nextEvent(id: string, afterSeq: number): Promise<StageEvent | undefined>;
    markAcked(id: string, seq: number): Promise<unknown>;
  };
  readonly bus: EventBus;
  readonly audio: Pick<AudioResolver, 'audioFor'>;
}

export interface StreamOptions {
  /** 等待新事件期间的兜底重查间隔：其他实例的事件经总线（LISTEN/NOTIFY）送达，这是通知丢失（监听连接重连期间）时的安全网 */
  readonly pollMs: number;
}

/**
 * 一个连接上的播放流：按 seq 逐个推送舞台事件，客户端播放完 ack 后才推送下一个；
 * 没有新事件时等待总线通知，并按 pollMs 兜底重查；对局结束且事件推送完毕后发送 end。实时与回放走同一条路径。
 */
export function createMatchStream(matchId: string, socket: StreamSocket, deps: StreamDeps, options: StreamOptions) {
  let cursor = 0;
  let awaiting: number | null = null;
  let started = false;
  let closed = false;
  let pumping = false;
  /** 推送进行中又收到了通知：这一轮结束后必须再查一次，否则这次唤醒就丢了 */
  let dirty = false;
  /** 上一次在"没有新事件"时告知观众的状态；兜底重查查到状态没变时不重复发 */
  let lastStatus: MatchStatus | null = null;
  /** 续播时客户端报的 afterSeq：观众已经播到这里，第一次查到对局后把它当作一次确认补记 */
  let pendingAck: number | null = null;
  let pollTimer: NodeJS.Timeout | null = null;
  const unsubscribes = [
    deps.bus.on('match:events', (payload) => payload.matchId === matchId && void pump()),
    deps.bus.on('match:status', (payload) => payload.matchId === matchId && void pump()),
  ];

  function clearPoll(): void {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
  }

  /** 只在等待"尚未产生的事件"时安排重查；等待观众 ack 期间推送由 ack 驱动，不查 */
  function schedulePoll(): void {
    clearPoll();
    if (closed) return;
    pollTimer = setTimeout(() => {
      pollTimer = null;
      void pump();
    }, options.pollMs);
  }

  async function prefetchAudio(after: number, scripted: boolean): Promise<void> {
    let seq = after;
    for (let i = 0; i < PREFETCH_EVENTS; i += 1) {
      const next = await deps.matches.nextEvent(matchId, seq);
      if (!next) return;
      void deps.audio.audioFor(matchId, next, scripted);
      seq = next.seq;
    }
  }

  async function send(event: StageEvent, scripted: boolean): Promise<void> {
    const audio = await deps.audio.audioFor(matchId, event, scripted);
    if (closed) return;
    awaiting = event.seq;
    lastStatus = null;
    socket.send(encode({ type: 'event', event, audio }));
    void prefetchAudio(event.seq, scripted);
  }

  async function markAcked(seq: number): Promise<void> {
    await deps.matches.markAcked(matchId, seq);
    deps.bus.emit('match:acked', { matchId, seq });
  }

  /**
   * 断线前最后一次 ack 可能没送到：重连带来的 afterSeq 就是观众已播完的进度，补记为确认，
   * 后台"观众确认"不会少一个，ack 节奏的闸门也不会卡住。记录失败只记日志，不影响续播。
   */
  async function settlePendingAck(): Promise<void> {
    if (pendingAck === null) return;
    const seq = pendingAck;
    pendingAck = null;
    try {
      await markAcked(seq);
    } catch (error) {
      logger.warn('补记观众续播进度失败', { matchId, seq, error: (error as Error).message });
    }
  }

  /** 推送一步：有下一个事件就推，没有就按对局状态发 status / end */
  async function step(): Promise<void> {
    const match = await deps.matches.find(matchId);
    if (!match) {
      socket.send(encode({ type: 'error', message: '对局不存在' }));
      close();
      return;
    }
    await settlePendingAck();
    const next = await deps.matches.nextEvent(matchId, cursor);
    if (next) {
      await send(next, match.scripted);
    } else if (TERMINAL_STATUSES.has(match.status)) {
      socket.send(encode(match.status === 'failed'
        ? { type: 'status', status: 'failed', error: match.error }
        : { type: 'end', result: match.result }));
      close();
    } else {
      if (match.status !== lastStatus) {
        lastStatus = match.status;
        socket.send(encode({ type: 'status', status: match.status, error: null }));
      }
      schedulePoll();
    }
  }

  async function pump(): Promise<void> {
    if (!started || closed) return;
    if (pumping) {
      dirty = true;
      return;
    }
    pumping = true;
    clearPoll();
    try {
      do {
        dirty = false;
        if (awaiting !== null) return;
        await step();
      } while (dirty && !closed && awaiting === null);
    } catch (error) {
      logger.error('推送对局事件失败', { matchId, error: (error as Error).message });
    } finally {
      pumping = false;
    }
  }

  function teardown(): void {
    closed = true;
    clearPoll();
    unsubscribes.forEach((unsubscribe) => unsubscribe());
  }

  function close(): void {
    if (closed) return;
    teardown();
    socket.close(1000);
  }

  return {
    hello(afterSeq: number): void {
      if (started) return;
      started = true;
      cursor = afterSeq;
      if (afterSeq > 0) pendingAck = afterSeq;
      void pump();
    },
    async ack(seq: number): Promise<void> {
      if (awaiting === null || seq !== awaiting) return;
      cursor = seq;
      awaiting = null;
      await markAcked(seq);
      await pump();
    },
    dispose(): void {
      teardown();
    },
  };
}

export type MatchStream = ReturnType<typeof createMatchStream>;
