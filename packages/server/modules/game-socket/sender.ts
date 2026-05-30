import { isSessionCancelled, getEventPhaseKey } from './session';
import { prepareOutgoingEvent, collectPreparedAudioResources } from './media';
import type { GameSession, SessionEvent } from './session';
import type { MediaEvent } from './media';

interface SenderOptions {
  prefetchCount?: number;
  phaseLookahead?: number;
}

interface QueueItem {
  event: SessionEvent;
  prepared: Promise<MediaEvent>;
  done: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
}

interface PreparedSender {
  enqueue: (event: SessionEvent) => Promise<void>;
  getAudioResources: () => string[];
  flush: () => Promise<void>;
  send: (event: SessionEvent) => Promise<void>;
}

// 不需要等待客户端 ACK 的事件类型（通知类、阶段类、睁眼类）
// 只有发言类事件需要 sendAndWait 确保 TTS 播放完毕
const IMMEDIATE_EVENT_TYPES = new Set([
  'host', 'thinking',
  'action-requested', 'action-submitted', 'action-skipped',
  'phase-start', 'phase-end', 'phase-changed',
  'day-start',
  'wolf-wake', 'wolf-leader', 'seer-wake', 'guard-wake',
  'witch-antidote', 'witch-poison', 'witch-action',
  'sheriff-start', 'sheriff-speech', 'sheriff-candidates',
  'sheriff-vote', 'sheriff-runoff-speech', 'sheriff-runoff-vote',
  'sheriff-result', 'sheriff-badge-transfer', 'sheriff-badge-tear',
  'night-result', 'vote-result', 'speech-order',
  'effect-applied', 'effect-resolved',
  'skill-requested', 'skill-thinking', 'skill-executing',
  'skill-completed', 'skill-failed',
  'death-announced',
]);

function createPreparedSender(
  session: GameSession,
  options: SenderOptions = {},
): PreparedSender {
  const queue: QueueItem[] = [];
  let drainPromise: Promise<void> | null = null;
  const audioResources = new Set<string>();
  const prefetchCount = Number(options.prefetchCount) || 2;
  const phaseLookahead = Number.isInteger(options.phaseLookahead)
    ? (options.phaseLookahead as number)
    : null;

  async function enqueue(event: SessionEvent): Promise<void> {
    if (phaseLookahead != null) {
      while (
        queue.length &&
        exceedsPhaseLookahead(
          [...queue.map((item) => item.event), event],
          phaseLookahead,
        )
      ) {
        try {
          await queue[0].done;
        } catch (error) {
          if (isSessionCancelled(error)) return;
          throw error;
        }
      }
    }
    const item = {} as QueueItem;
    item.event = event;
    item.prepared = prepareOutgoingEvent(event);
    item.done = new Promise<void>((resolve, reject) => {
      item.resolve = resolve;
      item.reject = reject;
    });
    item.done.catch(() => {});
    queue.push(item);
    if (!drainPromise) {
      drainPromise = drain();
      drainPromise.catch(() => {});
    }
    if (phaseLookahead == null && queue.length > prefetchCount) {
      try {
        await queue[0].done;
      } catch (error) {
        if (isSessionCancelled(error)) return;
        throw error;
      }
    }
  }

  async function drain(): Promise<void> {
    try {
      while (queue.length) {
        const item = queue[0];
        // 即时事件跳过 TTS 音频生成，直接发送（延迟从 ~1-5s 降到 <1ms）
        if (IMMEDIATE_EVENT_TYPES.has(item.event.type || '')) {
          const narration = item.event.narration || item.event.message || '';
          const evt = {
            ...item.event,
            narration,
            subtitle: narration ? { text: narration, playerId: null, speakerRole: 'system', speakerLabel: '系统播报' } : undefined,
          };
          await session.send(evt as unknown as Record<string, unknown>);
          item.resolve();
          queue.shift();
          continue;
        }

        try {
          const prepared = await item.prepared;
          collectPreparedAudioResources(prepared, audioResources);
          await session.sendAndWait(prepared as unknown as Record<string, unknown>);
          item.resolve();
        } catch (error) {
          item.reject(error as Error);
          throw error;
        } finally {
          queue.shift();
        }
      }
    } finally {
      drainPromise = null;
    }
  }

  return {
    enqueue,
    getAudioResources(): string[] {
      return [...audioResources];
    },
    async flush(): Promise<void> {
      if (!drainPromise) return;
      try {
        await drainPromise;
      } catch (error) {
        if (isSessionCancelled(error)) return;
        throw error;
      }
    },
    async send(event: SessionEvent): Promise<void> {
      await enqueue(event);
      if (!drainPromise) return;
      try {
        await drainPromise;
      } catch (error) {
        if (isSessionCancelled(error)) return;
        throw error;
      }
    },
  };
}

function exceedsPhaseLookahead(events: SessionEvent[], phaseLookahead: number): boolean {
  const phaseKeys: string[] = [];
  for (const event of events) {
    const key = getEventPhaseKey(event);
    if (!key || phaseKeys.includes(key)) continue;
    phaseKeys.push(key);
  }
  return phaseKeys.length > phaseLookahead + 1;
}

export { createPreparedSender, exceedsPhaseLookahead };
export type { PreparedSender, SenderOptions };
