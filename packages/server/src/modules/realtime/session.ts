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
  /** 等待新事件期间的兜底重查间隔：总线只在本进程内，其他实例的 worker 产生的事件靠它发现 */
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

  /** 推送一步：有下一个事件就推，没有就按对局状态发 status / end */
  async function step(): Promise<void> {
    const match = await deps.matches.find(matchId);
    if (!match) {
      socket.send(encode({ type: 'error', message: '对局不存在' }));
      close();
      return;
    }
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
      void pump();
    },
    async ack(seq: number): Promise<void> {
      if (awaiting === null || seq !== awaiting) return;
      cursor = seq;
      awaiting = null;
      await deps.matches.markAcked(matchId, seq);
      deps.bus.emit('match:acked', { matchId, seq });
      await pump();
    },
    dispose(): void {
      teardown();
    },
  };
}

export type MatchStream = ReturnType<typeof createMatchStream>;
