import type {
  PlaybackEvent,
  PlaybackEventSource,
  PlaybackMediaReference,
} from '@ai-presenter/shared/types/playbackTypes';
import { createPreparedSender } from './sender';
import type { GameSession, SessionEvent } from './session';

const PLAYBACK_PROTOCOL_VERSION = 1;

interface PlaybackPipelineOptions {
  viewMode: string;
  prefetchCount?: number;
  phaseLookahead?: number;
  capture?: boolean;
}

interface PlaybackPipeline {
  enqueue: (event: SessionEvent) => Promise<void>;
  send: (event: SessionEvent) => Promise<void>;
  prepare: (event: SessionEvent) => Promise<PlaybackEvent>;
  sendPrepared: (event: PlaybackEvent) => Promise<void>;
  play: (source: PlaybackEventSource) => Promise<void>;
  playLive: (source: PlaybackEventSource<SessionEvent>) => Promise<void>;
  flush: () => Promise<void>;
  freezeCapture: () => PlaybackEvent[];
  getEvents: () => PlaybackEvent[];
  getAudioResources: () => string[];
}

interface LivePlaybackEventSource extends PlaybackEventSource<SessionEvent> {
  push: (event: SessionEvent) => void;
  close: () => void;
}

function createPlaybackPipeline(
  session: GameSession,
  options: PlaybackPipelineOptions,
): PlaybackPipeline {
  const captured: PlaybackEvent[] = [];
  let captureEnabled = options.capture !== false;
  let nextSequence = 1;
  const sender = createPreparedSender(session, {
    prefetchCount: options.prefetchCount,
    phaseLookahead: options.phaseLookahead,
    onPrepared: capture,
  });

  function capture(payload: SessionEvent): PlaybackEvent {
    const event = toPlaybackEvent(payload, options.viewMode, nextSequence);
    if (!captureEnabled) return event;
    nextSequence += 1;
    captured.push(event);
    return event;
  }

  async function prepare(event: SessionEvent): Promise<PlaybackEvent> {
    const payload = await sender.prepare(event);
    return capture(payload);
  }

  async function play(source: PlaybackEventSource): Promise<void> {
    for await (const event of source.events()) {
      await sender.sendPrepared(event.payload as SessionEvent);
    }
  }

  async function playLive(source: PlaybackEventSource<SessionEvent>): Promise<void> {
    for await (const event of source.events()) {
      await sender.enqueue(event);
    }
    await sender.flush();
  }

  return {
    enqueue: sender.enqueue,
    send: sender.send,
    prepare,
    sendPrepared: (event) => sender.sendPrepared(event.payload as SessionEvent),
    play,
    playLive,
    flush: sender.flush,
    freezeCapture: () => {
      captureEnabled = false;
      return captured.map(clonePlaybackEvent);
    },
    getEvents: () => captured.map(clonePlaybackEvent),
    getAudioResources: sender.getAudioResources,
  };
}

async function preparePlaybackEvents(
  events: readonly SessionEvent[],
  viewMode: string,
  startSequence = 1,
): Promise<PlaybackEvent[]> {
  const preparedSession = createPreparationSession();
  const sender = createPreparedSender(preparedSession);
  const prepared: PlaybackEvent[] = [];

  for (const [index, event] of events.entries()) {
    const payload = await sender.prepare(event);
    prepared.push(toPlaybackEvent(payload, viewMode, startSequence + index));
  }

  return prepared;
}

function createPreparationSession(): GameSession {
  return {
    send() {},
    async sendAndWait() {},
    resolveAck() {},
    close() {},
    setPaused() {},
    skipCurrentPhase() {},
  };
}

function createLivePlaybackSource(): LivePlaybackEventSource {
  const queue: SessionEvent[] = [];
  const waiters: Array<() => void> = [];
  let closed = false;

  function wake(): void {
    waiters.splice(0).forEach((resolve) => resolve());
  }

  return {
    push(event: SessionEvent): void {
      if (closed) throw new Error('Playback event source is closed.');
      queue.push(event);
      wake();
    },
    close(): void {
      closed = true;
      wake();
    },
    async *events(): AsyncIterable<SessionEvent> {
      while (!closed || queue.length) {
        if (queue.length) {
          yield queue.shift()!;
          continue;
        }
        await new Promise<void>((resolve) => waiters.push(resolve));
      }
    },
  };
}

function createStoredPlaybackSource(events: PlaybackEvent[]): PlaybackEventSource {
  const ordered = [...events].sort((a, b) => a.sequence - b.sequence);
  return {
    async *events(): AsyncIterable<PlaybackEvent> {
      for (const event of ordered) yield clonePlaybackEvent(event);
    },
  };
}

function toPlaybackEvent(
  payload: SessionEvent,
  viewMode: string,
  sequence: number,
): PlaybackEvent {
  const cleanPayload = JSON.parse(JSON.stringify(payload || {})) as Record<string, unknown>;
  delete cleanPayload.ackId;
  const game = cleanPayload.game as Record<string, unknown> | undefined;
  const payloadViewMode = typeof game?.clientViewMode === 'string' ? game.clientViewMode : '';
  return {
    protocolVersion: PLAYBACK_PROTOCOL_VERSION,
    sequence,
    eventType: String(cleanPayload.type || cleanPayload.workflowEvent || 'event'),
    viewMode: payloadViewMode || viewMode || 'god',
    payload: cleanPayload,
    media: collectMediaReferences(cleanPayload),
  };
}

function collectMediaReferences(payload: Record<string, unknown>): PlaybackMediaReference[] {
  const media: PlaybackMediaReference[] = [];
  const audioUrl = typeof payload.audioUrl === 'string' ? payload.audioUrl : '';
  if (audioUrl) {
    media.push({
      url: audioUrl,
      mimeType: typeof payload.audioMimeType === 'string' ? payload.audioMimeType : undefined,
    });
  }
  const segments = Array.isArray(payload.audioSegments) ? payload.audioSegments : [];
  for (const item of segments) {
    if (!item || typeof item !== 'object') continue;
    const segment = item as Record<string, unknown>;
    if (typeof segment.audioUrl !== 'string' || !segment.audioUrl) continue;
    media.push({
      url: segment.audioUrl,
      mimeType: typeof segment.audioMimeType === 'string' ? segment.audioMimeType : undefined,
    });
  }
  return media;
}

function clonePlaybackEvent(event: PlaybackEvent): PlaybackEvent {
  return JSON.parse(JSON.stringify(event)) as PlaybackEvent;
}

export {
  createPlaybackPipeline,
  createLivePlaybackSource,
  createStoredPlaybackSource,
  preparePlaybackEvents,
  toPlaybackEvent,
};
export type { PlaybackPipeline, PlaybackPipelineOptions, LivePlaybackEventSource };
