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

const IMMEDIATE_EVENT_TYPES = new Set(['thinking']);

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
        try {
          const prepared = await item.prepared;
          collectPreparedAudioResources(prepared, audioResources);
          if (IMMEDIATE_EVENT_TYPES.has(prepared.type || '')) {
            await session.send(prepared as unknown as Record<string, unknown>);
          } else {
            await session.sendAndWait(prepared as unknown as Record<string, unknown>);
          }
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
