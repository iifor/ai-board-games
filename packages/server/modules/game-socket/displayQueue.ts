import { getNarration } from './narration';
import { prepareOutgoingEvent, collectPreparedAudioResources } from './media';
import type { GameSession, SessionEvent } from './session';
import type { MediaEvent } from './media';

interface DisplayQueueOptions {
  prefetchCount?: number;
}

interface DisplayQueueItem {
  event: SessionEvent;
  displaySeq: number;
  enqueueOrder: number;
  prepared: Promise<MediaEvent> | null;
  done: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
}

interface DisplayQueue {
  enqueue: (event: SessionEvent) => Promise<void>;
  flush: () => Promise<void>;
  send: (event: SessionEvent) => Promise<void>;
  getAudioResources: () => string[];
}

const SYSTEM_EVENT_TYPES = new Set([
  'error',
  'host',
  'thinking',
  'teams-randomized',
]);

function createDisplayQueue(
  session: GameSession,
  options: DisplayQueueOptions = {},
): DisplayQueue {
  const queue: DisplayQueueItem[] = [];
  const audioResources = new Set<string>();
  const prefetchCount = Math.max(1, Number(options.prefetchCount) || 2);
  let lastDisplaySeq = 0;
  let nextEnqueueOrder = 1;
  let inFlight: DisplayQueueItem | null = null;
  let pumpPromise: Promise<void> | null = null;

  async function enqueue(event: SessionEvent): Promise<void> {
    if (!isDisplayEvent(event)) {
      session.send(withImmediateNarration(event));
      return;
    }

    const item = createItem(event);
    queue.push(item);
    queue.sort(compareItems);
    startPrefetch();
    pump();
  }

  async function send(event: SessionEvent): Promise<void> {
    if (!isDisplayEvent(event)) {
      session.send(withImmediateNarration(event));
      return;
    }
    const item = createItem(event);
    queue.push(item);
    queue.sort(compareItems);
    startPrefetch();
    pump();
    await item.done;
  }

  async function flush(): Promise<void> {
    while (inFlight || queue.length || pumpPromise) {
      const pending = [
        inFlight?.done,
        ...queue.map((item) => item.done),
        pumpPromise,
      ].filter(Boolean) as Promise<void>[];
      if (!pending.length) return;
      const results = await Promise.allSettled(pending);
      const rejected = results.find((result) => result.status === 'rejected');
      if (rejected?.status === 'rejected') throw rejected.reason;
      if (!inFlight && !queue.length && !pumpPromise) return;
    }
  }

  function createItem(event: SessionEvent): DisplayQueueItem {
    const item = {} as DisplayQueueItem;
    item.event = event;
    item.displaySeq = getDisplaySeq(event);
    item.enqueueOrder = nextEnqueueOrder;
    nextEnqueueOrder += 1;
    item.prepared = null;
    item.done = new Promise<void>((resolve, reject) => {
      item.resolve = resolve;
      item.reject = reject;
    });
    item.done.catch(() => {});
    return item;
  }

  function getDisplaySeq(event: SessionEvent): number {
    const metadata = event.metadata as { sequence?: unknown } | undefined;
    const sequence = Number(metadata?.sequence);
    if (Number.isFinite(sequence) && sequence > 0) {
      lastDisplaySeq = Math.max(lastDisplaySeq, sequence);
      return sequence;
    }
    const fallback = lastDisplaySeq + 1;
    lastDisplaySeq = fallback;
    return fallback;
  }

  function startPrefetch(): void {
    const activePreparedCount =
      (inFlight?.prepared ? 1 : 0) + queue.filter((item) => item.prepared).length;
    let available = Math.max(0, prefetchCount - activePreparedCount);
    for (const item of queue) {
      if (!available) return;
      if (item.prepared) continue;
      item.prepared = prepareOutgoingEvent(item.event);
      item.prepared.catch(() => {});
      available -= 1;
    }
  }

  function pump(): void {
    if (pumpPromise) return;
    pumpPromise = runPump().finally(() => {
      pumpPromise = null;
      if (!inFlight && queue.length) pump();
    });
    pumpPromise.catch(() => {});
  }

  async function runPump(): Promise<void> {
    while (!inFlight && queue.length) {
      const item = queue.shift()!;
      inFlight = item;
      if (!item.prepared) {
        item.prepared = prepareOutgoingEvent(item.event);
        item.prepared.catch(() => {});
      }
      startPrefetch();
      try {
        const prepared = await item.prepared;
        collectPreparedAudioResources(prepared, audioResources);
        await session.sendAndWait(prepared as unknown as Record<string, unknown>);
        item.resolve();
      } catch (error) {
        item.reject(error as Error);
        throw error;
      } finally {
        inFlight = null;
        startPrefetch();
      }
    }
  }

  return {
    enqueue,
    flush,
    send,
    getAudioResources(): string[] {
      return [...audioResources];
    },
  };
}

function compareItems(a: DisplayQueueItem, b: DisplayQueueItem): number {
  return a.displaySeq - b.displaySeq || a.enqueueOrder - b.enqueueOrder;
}

function withImmediateNarration(event: SessionEvent): Record<string, unknown> {
  const narration = getNarration(event as Parameters<typeof getNarration>[0]) || event.narration || event.message || '';
  const payload: Record<string, unknown> = { ...event, narration };
  if (!payload.message && narration) payload.message = narration;
  return payload;
}

function isDisplayEvent(event: SessionEvent): boolean {
  const eventType = String(event.type || '');
  if (SYSTEM_EVENT_TYPES.has(eventType)) return false;
  if (eventType === 'workflow-completed' || eventType === 'done' || eventType === 'game') return true;
  if (eventType === 'workflow-event' || eventType === 'phase-changed') return true;
  if (event.workflowEvent) return true;
  if (event.audienceCue) return true;
  if (event.speech || event.testimony) return true;
  if (event.presentation) return true;
  if (event.message || event.narration) return true;
  if (event.game || event.players) return true;
  return false;
}

function isRuleIntroEvent(event: SessionEvent): boolean {
  const cue = event.audienceCue as { kind?: unknown } | undefined;
  return cue?.kind === 'rule-intro';
}

export { createDisplayQueue, isDisplayEvent, isRuleIntroEvent };
export type { DisplayQueue, DisplayQueueOptions };
