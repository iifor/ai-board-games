import { isSessionCancelled, getEventPhaseKey } from './session';
import { createDisplayQueue, isDisplayEvent, isRuleIntroEvent } from './displayQueue';
import type { GameSession, SessionEvent } from './session';

interface SenderOptions {
  prefetchCount?: number;
  phaseLookahead?: number;
  onPrepared?: (event: SessionEvent) => void;
}

interface PreparedSender {
  enqueue: (event: SessionEvent) => Promise<void>;
  getAudioResources: () => string[];
  flush: () => Promise<void>;
  send: (event: SessionEvent) => Promise<void>;
  sendPrepared: (event: SessionEvent) => Promise<void>;
  prepare: (event: SessionEvent) => Promise<SessionEvent>;
}

function createPreparedSender(
  session: GameSession,
  options: SenderOptions = {},
): PreparedSender {
  const displayQueue = createDisplayQueue(session, {
    prefetchCount: options.prefetchCount,
    onPrepared: options.onPrepared,
  });

  async function enqueue(event: SessionEvent): Promise<void> {
    try {
      await displayQueue.enqueue(event);
    } catch (error) {
      if (isSessionCancelled(error)) return;
      throw error;
    }
  }

  return {
    enqueue,
    getAudioResources(): string[] {
      return displayQueue.getAudioResources();
    },
    async flush(): Promise<void> {
      try {
        await displayQueue.flush();
      } catch (error) {
        if (isSessionCancelled(error)) return;
        throw error;
      }
    },
    async send(event: SessionEvent): Promise<void> {
      try {
        await displayQueue.send(event);
      } catch (error) {
        if (isSessionCancelled(error)) return;
        throw error;
      }
    },
    async sendPrepared(event: SessionEvent): Promise<void> {
      await displayQueue.sendPrepared(event);
    },
    prepare(event: SessionEvent): Promise<SessionEvent> {
      return displayQueue.prepare(event);
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

function isImmediateEvent(event: SessionEvent): boolean {
  return !isDisplayEvent(event);
}

export {
  createPreparedSender,
  exceedsPhaseLookahead,
  isImmediateEvent,
  isRuleIntroEvent,
  isDisplayEvent,
};
export type { PreparedSender, SenderOptions };
