import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { getGameEngine, resetGameEngine } from '../../packages/server/modules/engine-registry';
import { createSession, isSpeechWaitPayload, parseMessage } from '../../packages/server/modules/game-socket/session';
import { createPreparedSender, isImmediateEvent, isRuleIntroEvent } from '../../packages/server/modules/game-socket/sender';
import { runSession } from '../../packages/server/modules/game-socket/service';
import {
  createLivePlaybackSource,
  createPlaybackPipeline,
  createStoredPlaybackSource,
  preparePlaybackEvents,
  toPlaybackEvent,
} from '../../packages/server/modules/game-socket/playback';
import { createGameCapacity, createSessionStartGuard } from '../../packages/server/modules/game-socket/capacity';

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

  return {
    socket,
    sent,
    emit(event: string, ...args: unknown[]) {
      emitter.emit(event, ...args);
    },
  };
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

test('GameSession aborts its runtime signal on socket close and error', () => {
  const closed = createMockSocket();
  const closedSession = createSession(closed.socket as never);
  assert.equal(closedSession.signal.aborted, false);
  closed.socket.close();
  assert.equal(closedSession.signal.aborted, true);
  assert.match(String(closedSession.signal.reason), /game-session-cancelled/);

  const failed = createMockSocket();
  const failedSession = createSession(failed.socket as never);
  failed.emit('error', new Error('socket failed'));
  assert.equal(failedSession.signal.aborted, true);
  assert.match(String(failedSession.signal.reason), /game-session-cancelled/);
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

test('parseMessage accepts supported game commands', () => {
  assert.deepEqual(parseMessage(JSON.stringify({
    type: 'start',
    gameType: 'undercover',
    playerIds: [1, '2'],
    debugMode: false,
    variantKey: 'standard-6',
  })), {
    type: 'start',
    gameType: 'undercover',
    playerIds: [1, '2'],
    debugMode: false,
    variantKey: 'standard-6',
  });
  assert.deepEqual(parseMessage('{"type":"ack","ackId":1}'), {
    type: 'ack',
    ackId: 1,
  });
  assert.deepEqual(parseMessage('{"type":"control","action":"skip-phase"}'), {
    type: 'control',
    action: 'skip-phase',
  });
});

test('parseMessage preserves the existing client start payload', () => {
  const payload = {
    type: 'start',
    mode: 'real',
    gameType: 'werewolf',
    playerIds: [1, 2],
    hostId: 3,
    topic: null,
    debateTeams: null,
    replayView: false,
  };

  assert.deepEqual(parseMessage(JSON.stringify(payload)), payload);
});

test('runSession keeps debugMode on runtime and completed payloads', async (t) => {
  resetGameEngine();
  const gameType = 'debug-session-fixture';
  getGameEngine().registerDefinition({
    gameType,
    version: '1.0.0',
    workflowId: `${gameType}-v1`,
    actionSchemas: {},
    metadata: {
      session: {
        startMessage: 'fixture start',
        doneMessage: 'fixture done',
        playerSelection: { min: 1, max: 1, errorMessage: 'select one fixture player' },
      },
    },
    runtime: {
      createMatch: () => ({ id: 'debug-session-match' }),
      run: async (_matchId, context) => {
        context?.onEvent?.({
          type: 'fixture-runtime',
          message: 'fixture runtime',
          presentation: { speakableText: 'fixture runtime', requiresAck: false },
        });
        return { id: 'debug-session-match', gameType, players: [{ id: 1, nickname: 'fixture' }] };
      },
    },
  });
  const aiConfigModule = require('../../packages/server/config/ai') as { getAiConfig: () => unknown };
  const settingsModule = require('../../packages/server/modules/settings/service') as { getSpectatorMode: () => boolean };
  const originalGetAiConfig = aiConfigModule.getAiConfig;
  const originalGetSpectatorMode = settingsModule.getSpectatorMode;
  aiConfigModule.getAiConfig = () => ({
    host: { id: 0, name: 'host', nickname: 'host' },
    players: [{ id: 1, name: 'fixture', nickname: 'fixture' }],
    missingProviders: [],
    realReady: true,
  });
  settingsModule.getSpectatorMode = () => false;
  t.after(() => {
    aiConfigModule.getAiConfig = originalGetAiConfig;
    settingsModule.getSpectatorMode = originalGetSpectatorMode;
    resetGameEngine();
  });

  const sent: SentPayload[] = [];
  const session = createImmediateSession(sent);
  await runSession(session as never, 'real', [1], gameType, { debugMode: true });

  assert.equal(sent.find((event) => event.type === 'fixture-runtime')?.debugMode, true);
  assert.equal(sent.find((event) => event.type === 'done')?.debugMode, true);
});

test('runSession propagates socket cancellation to runtime and releases game capacity', async (t) => {
  resetGameEngine();
  const gameType = 'abort-session-fixture';
  let receivedSignal: unknown;
  let runtimeStarted!: () => void;
  const started = new Promise<void>((resolve) => { runtimeStarted = resolve; });
  getGameEngine().registerDefinition({
    gameType,
    version: '1.0.0',
    workflowId: `${gameType}-v1`,
    actionSchemas: {},
    metadata: {
      session: {
        startMessage: 'fixture start',
        doneMessage: 'fixture done',
        playerSelection: { min: 1, max: 1, errorMessage: 'select one fixture player' },
      },
    },
    runtime: {
      createMatch: () => ({ id: 'abort-session-match' }),
      run: async (_matchId, context) => {
        receivedSignal = context?.signal;
        runtimeStarted();
        if (!context?.signal) throw new Error('runtime signal missing');
        await new Promise<void>((_resolve, reject) => {
          context.signal!.addEventListener('abort', () => reject(context.signal!.reason), { once: true });
        });
        return { id: 'abort-session-match', gameType, players: [] };
      },
    },
  });
  const aiConfigModule = require('../../packages/server/config/ai') as { getAiConfig: () => unknown };
  const settingsModule = require('../../packages/server/modules/settings/service') as { getSpectatorMode: () => boolean };
  const originalGetAiConfig = aiConfigModule.getAiConfig;
  const originalGetSpectatorMode = settingsModule.getSpectatorMode;
  aiConfigModule.getAiConfig = () => ({
    host: { id: 0, name: 'host', nickname: 'host' },
    players: [{ id: 1, name: 'fixture', nickname: 'fixture' }],
    missingProviders: [],
    realReady: true,
  });
  settingsModule.getSpectatorMode = () => false;
  t.after(() => {
    aiConfigModule.getAiConfig = originalGetAiConfig;
    settingsModule.getSpectatorMode = originalGetSpectatorMode;
    resetGameEngine();
  });

  const fixture = createMockSocket();
  const session = createSession(fixture.socket as never);
  const capacity = createGameCapacity(1);
  const guard = createSessionStartGuard(capacity);
  const running = guard.run(session, false, () =>
    runSession(session, 'real', [1], gameType, { debugMode: true })
  );
  const outcome = running.then(
    () => null,
    (error: unknown) => error,
  );
  await started;

  assert.equal(receivedSignal, session.signal);
  assert.equal(capacity.stats().active, 1);
  fixture.socket.close();
  assert.match(String(await outcome), /game-session-cancelled/);
  assert.equal(capacity.stats().active, 0);
  assert.equal(await guard.run({}, false, async () => 'released'), 'released');
});

test('parseMessage rejects malformed and unknown commands', () => {
  assert.equal(parseMessage('{'), null);
  assert.equal(parseMessage('{"type":"unknown"}'), null);
  assert.equal(parseMessage('{"type":"ack"}'), null);
  assert.equal(parseMessage('{"type":"control","action":"restart"}'), null);
  assert.equal(parseMessage(JSON.stringify({
    type: 'start',
    playerIds: Array.from({ length: 101 }, (_, index) => index + 1),
  })), null);
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

test('PreparedSender sends no-poison display without audio ack', async () => {
  const sent: SentPayload[] = [];
  const session = createImmediateSession(sent);
  const sender = createPreparedSender(session as never);

  await sender.send({
    type: 'workflow-event',
    workflowEvent: 'witch-action',
    actionType: 'witch_poison',
    witchAction: { use: false, target: null, reason: '' },
    presentation: {
      speakableText: '',
      displayText: '女巫没有使用毒药',
      displayMode: 'status',
      uiHint: 'witch-poison-result',
      suppressSpeech: true,
      requiresAck: false,
    },
  });

  assert.equal(sent.length, 1);
  assert.equal('ackId' in sent[0], false);
  assert.equal(sent[0].presentation?.displayText, '女巫没有使用毒药');
  assert.equal(sent[0].subtitle, undefined);
  assert.equal(sent[0].audioUrl, undefined);
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

test('PlaybackPipeline replays a stored host start as an immediate event', async () => {
  const sent: SentPayload[] = [];
  const waited: SentPayload[] = [];
  const session = {
    send(payload: Record<string, unknown>) { sent.push(payload as SentPayload); },
    async sendAndWait(payload: Record<string, unknown>) { waited.push(payload as SentPayload); },
    resolveAck() {},
    close() {},
    setPaused() {},
    skipCurrentPhase() {},
  };
  const pipeline = createPlaybackPipeline(session as never, {
    viewMode: 'god',
    capture: false,
  });
  const storedStart = toPlaybackEvent({
    type: 'host',
    message: 'fixture start',
    game: { type: 'fixture' },
  }, 'god', 1);

  await pipeline.play(createStoredPlaybackSource([storedStart]));

  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, 'host');
  assert.equal(waited.length, 0);
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

test('PlaybackPipeline freezes the live prefix and prepares the unsent suffix offline', async () => {
  const pipeline = createPlaybackPipeline(createImmediateSession([]) as never, {
    viewMode: 'god',
    capture: true,
  });
  const first = createSilentWorkflowEvent('first');
  const second = createSilentWorkflowEvent('second');
  const completed = createSilentWorkflowEvent('workflow-completed');

  await pipeline.prepare(first);
  const prefix = pipeline.freezeCapture();
  await pipeline.prepare(second);

  const suffix = await preparePlaybackEvents(
    [second, completed],
    'god',
    prefix.length + 1,
  );
  const stored = [...prefix, ...suffix];

  assert.deepEqual(stored.map((event) => event.sequence), [1, 2, 3]);
  assert.deepEqual(
    stored.map((event) => event.payload.marker),
    ['first', 'second', 'workflow-completed'],
  );
  assert.equal(pipeline.getEvents().length, 1);
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

function createSilentWorkflowEvent(marker: string) {
  return {
    type: marker === 'workflow-completed' ? marker : 'workflow-event',
    workflowEvent: marker,
    marker,
    message: '',
    presentation: {
      suppressSpeech: true,
      requiresAck: false,
    },
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.equal(predicate(), true);
}
