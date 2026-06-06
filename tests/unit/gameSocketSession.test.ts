import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createSession, isSpeechWaitPayload } from '../../packages/server/modules/game-socket/session';
import { createPreparedSender, isImmediateEvent, isRuleIntroEvent } from '../../packages/server/modules/game-socket/sender';
import {
  createLivePlaybackSource,
  createPlaybackPipeline,
  createStoredPlaybackSource,
  toPlaybackEvent,
} from '../../packages/server/modules/game-socket/playback';

interface SentPayload {
  type?: string;
  ackId?: number;
  workflowEvent?: string;
  audienceCue?: { kind?: string };
  [key: string]: unknown;
}

function createMockSocket() {
  const emitter = new EventEmitter();
  const sent: SentPayload[] = [];
  const socket = {
    OPEN: 1,
    readyState: 1,
    send(payload: string) {
      sent.push(JSON.parse(payload) as SentPayload);
    },
    close() {
      socket.readyState = 3;
      emitter.emit('close');
    },
    on(event: string, listener: (...args: unknown[]) => void) {
      emitter.on(event, listener);
      return socket;
    },
  };

  return { socket, sent };
}

test('GameSession.send sends immediate events without ackId', () => {
  const { socket, sent } = createMockSocket();
  const session = createSession(socket as never);

  session.send({ type: 'phase-start', message: 'night' });

  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0], { type: 'phase-start', message: 'night' });
});

test('GameSession.sendAndWait injects ackId and resolves on ack', async () => {
  const { socket, sent } = createMockSocket();
  const session = createSession(socket as never);

  const pending = session.sendAndWait({ type: 'speech', message: 'hello' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].ackId, 1);
  session.resolveAck(String(sent[0].ackId));
  await pending;
});

test('GameSession treats rule intro as long playback wait payload', () => {
  assert.equal(isSpeechWaitPayload({
    type: 'workflow-event',
    workflowEvent: 'phase-changed',
    audienceCue: { kind: 'rule-intro' },
  }), true);
  assert.equal(isSpeechWaitPayload({
    type: 'workflow-event',
    workflowEvent: 'action-requested',
  }), false);
});

test('PreparedSender sends display events one at a time behind ack', async () => {
  const sent: SentPayload[] = [];
  const waiters: Array<() => void> = [];
  const session = {
    send(payload: Record<string, unknown>) {
      sent.push(payload as SentPayload);
    },
    sendAndWait(payload: Record<string, unknown>) {
      sent.push({ ...payload, ackId: sent.length + 1 } as SentPayload);
      return new Promise<void>((resolve) => {
        waiters.push(resolve);
      });
    },
    resolveAck() {},
    close() {},
    setPaused() {},
    skipCurrentPhase() {},
  };
  const sender = createPreparedSender(session as never, { prefetchCount: 10 });

  await sender.enqueue({
    type: 'workflow-event',
    workflowEvent: 'phase-changed',
    message: 'rule intro',
    audienceCue: { kind: 'rule-intro', display: 'modal', speech: 'browser', textField: 'text', once: true },
  });
  await sender.enqueue({
    type: 'workflow-event',
    workflowEvent: 'action-requested',
    actionType: 'wolf_vote',
    message: '',
    presentation: { suppressSpeech: true },
  });
  await sender.enqueue({
    type: 'workflow-event',
    workflowEvent: 'action-submitted',
    speech: { playerId: 2, text: 'wolf speech' },
  });
  await waitFor(() => sent.length === 1);

  assert.equal(sent.length, 1);
  assert.equal(sent[0].ackId, 1);
  assert.equal(sent[0].audienceCue?.kind, 'rule-intro');

  waiters[0]();
  await waitFor(() => sent.length === 2);

  assert.equal(sent[1].workflowEvent, 'action-requested');
  assert.equal(sent[1].ackId, 2);
  assert.equal(sent.length, 2);

  waiters[1]();
  await waitFor(() => sent.length === 3);

  assert.equal(sent[2].workflowEvent, 'action-submitted');
  assert.equal(sent[2].ackId, 3);
});

test('PreparedSender classifies C-end workflow events as display events', () => {
  assert.equal(isRuleIntroEvent({ audienceCue: { kind: 'rule-intro' } }), true);
  assert.equal(isImmediateEvent({ type: 'workflow-event', workflowEvent: 'phase-changed', audienceCue: { kind: 'rule-intro' } }), false);
  assert.equal(isImmediateEvent({ type: 'workflow-event', workflowEvent: 'action-requested' }), false);
  assert.equal(isImmediateEvent({ type: 'workflow-event', workflowEvent: 'action-submitted', speech: { text: 'wolf speech' } }), false);
  assert.equal(isImmediateEvent({ type: 'error', message: 'failed' }), true);
});

test('PlaybackPipeline replays exact prepared payloads without ack ids', async () => {
  const liveSent: SentPayload[] = [];
  const live = createPlaybackPipeline(createImmediateSession(liveSent) as never, {
    viewMode: 'player',
    capture: true,
  });

  const liveSource = createLivePlaybackSource();
  const livePlayback = live.playLive(liveSource);
  liveSource.push({
    type: 'speech',
    speech: { playerId: 2, text: '精确回放内容' },
    game: { id: 'werewolf-test', clientViewMode: 'player' },
  });
  liveSource.close();
  await livePlayback;
  const completed = await live.prepare({
    type: 'workflow-completed',
    message: '游戏结束',
    game: { id: 'werewolf-test', clientViewMode: 'player' },
  });
  const stored = live.getEvents();
  assert.equal(stored.length, 2);
  assert.equal(stored[0].viewMode, 'player');
  assert.equal('ackId' in stored[0].payload, false);

  const replaySent: SentPayload[] = [];
  const replay = createPlaybackPipeline(createImmediateSession(replaySent) as never, {
    viewMode: 'player',
    capture: false,
  });
  await replay.play(createStoredPlaybackSource(stored));

  assert.deepEqual(replaySent, stored.map((event) => event.payload));
  assert.deepEqual(completed.payload, stored[1].payload);
});

test('PlaybackEvent strips ack ids and records media references', () => {
  const event = toPlaybackEvent({
    type: 'speech',
    ackId: 99,
    audioUrl: '/audio/test.mp3',
    audioMimeType: 'audio/mpeg',
  }, 'god', 7);

  assert.equal(event.sequence, 7);
  assert.equal('ackId' in event.payload, false);
  assert.deepEqual(event.media, [{ url: '/audio/test.mp3', mimeType: 'audio/mpeg' }]);
});

function createImmediateSession(sent: SentPayload[]) {
  return {
    send(payload: Record<string, unknown>) {
      sent.push(payload as SentPayload);
    },
    async sendAndWait(payload: Record<string, unknown>) {
      sent.push(payload as SentPayload);
    },
    resolveAck() {},
    close() {},
    setPaused() {},
    skipCurrentPhase() {},
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.equal(predicate(), true);
}
