import assert from 'node:assert/strict';
import test from 'node:test';
import { createBrowserSpeechUtterance } from '../../packages/client/src/hooks/speech/browserSpeech';
import { getProfileForItem, normalizeVoiceProfile } from '../../packages/client/src/utils/speech';

type Cleanup = void | (() => void);
type HookParams = Record<string, unknown>;
type SessionHook = (params: HookParams) => Record<string, (...args: never[]) => unknown>;

test('browser speech multiplies and clamps the debug playback rate', (t) => {
  const originalSpeechSynthesisUtterance = globalThis.SpeechSynthesisUtterance;
  globalThis.SpeechSynthesisUtterance = FakeSpeechUtterance as unknown as typeof SpeechSynthesisUtterance;
  t.after(() => {
    globalThis.SpeechSynthesisUtterance = originalSpeechSynthesisUtterance;
  });

  const profile = normalizeVoiceProfile(getProfileForItem({ text: '测试', playerId: '1' }));
  const utterance = createBrowserSpeechUtterance(
    { text: '测试', playerId: '1', playbackRate: 2 },
    [],
  )!;
  const clamped = createBrowserSpeechUtterance(
    { text: '测试', playerId: '1', playbackRate: 4 },
    [],
  )!;

  assert.equal(utterance.rate, profile.rate * 2);
  assert.equal(clamped.rate, Math.min(profile.rate * 4, 10));
});

test('active speech restarts after pause and advances each ACK exactly once', (t) => {
  const fixture = createSessionFixture(t);
  const first = createAckEvent(1, 'first narration');
  const second = createAckEvent(2, 'second narration');

  fixture.start();
  fixture.emit(first);
  fixture.emit(second);
  assert.deepEqual(fixture.spokenTexts, ['first narration']);

  fixture.result.setAutoPlayEnabled(false);
  fixture.rerender();
  fixture.result.setAutoPlayEnabled(true);
  fixture.rerender();

  assert.deepEqual(fixture.spokenTexts, ['first narration', 'first narration']);
  fixture.speechEnds[1]();
  assert.deepEqual(fixture.ackIds(), [1]);
  assert.deepEqual(fixture.appliedAckIds, [1, 2]);
  assert.deepEqual(fixture.spokenTexts, ['first narration', 'first narration', 'second narration']);

  fixture.speechEnds[0]();
  assert.deepEqual(fixture.ackIds(), [1]);
  fixture.speechEnds[2]();
  fixture.speechEnds[2]();
  assert.deepEqual(fixture.ackIds(), [1, 2]);
  assert.equal(fixture.acknowledgedCount(), 2);
});

test('disabling speech resolves the active ACK once and advances the next event silently', (t) => {
  const fixture = createSessionFixture(t);

  fixture.start();
  fixture.emit(createAckEvent(11, 'active narration'));
  fixture.emit(createAckEvent(12, 'deferred narration'));
  assert.deepEqual(fixture.spokenTexts, ['active narration']);

  fixture.setSpeechEnabled(false);

  assert.deepEqual(fixture.ackIds(), [11]);
  assert.deepEqual(fixture.appliedAckIds, [11, 12]);
  assert.deepEqual(fixture.spokenTexts, ['active narration']);
  assert.equal(fixture.timers.pendingCount(), 1);

  fixture.speechEnds[0]();
  assert.deepEqual(fixture.ackIds(), [11]);
  fixture.timers.runNext();
  assert.deepEqual(fixture.ackIds(), [11, 12]);
  assert.equal(fixture.acknowledgedCount(), 2);
  assert.equal(fixture.timers.pendingCount(), 0);
});

test('Debate-style handled speech uses the guarded completion after voice-off', (t) => {
  const fixture = createSessionFixture(t, 'debate');

  fixture.start();
  fixture.emit(createAckEvent(21, 'active debate narration'));
  fixture.emit(createAckEvent(22, 'deferred debate narration'));
  const staleCompletion = fixture.speechEnds[0];

  fixture.setSpeechEnabled(false);
  assert.deepEqual(fixture.ackIds(), [21]);
  assert.deepEqual(fixture.appliedAckIds, [21, 22]);
  assert.equal(fixture.timers.pendingCount(), 1);

  staleCompletion();
  assert.deepEqual(fixture.ackIds(), [21]);
  fixture.timers.runNext();
  assert.deepEqual(fixture.ackIds(), [21, 22]);
  assert.equal(fixture.acknowledgedCount(), 2);
});

test('Werewolf direct audience speech uses guarded end and error callbacks after restart', (t) => {
  const fixture = createSessionFixture(t, 'werewolf');

  fixture.start();
  fixture.emit(createAudienceCueEvent(31, 'first rule'));
  fixture.emit(createAudienceCueEvent(32, 'second rule'));
  const staleUtterance = fixture.utterances[0];

  fixture.result.setAutoPlayEnabled(false);
  fixture.rerender();
  fixture.result.setAutoPlayEnabled(true);
  fixture.rerender();
  assert.equal(fixture.utterances.length, 2);

  fixture.utterances[1].onend?.();
  assert.deepEqual(fixture.ackIds(), [31]);
  assert.equal(fixture.utterances.length, 3);
  staleUtterance.onend?.();
  assert.deepEqual(fixture.ackIds(), [31]);
  fixture.utterances[2].onerror?.();
  fixture.utterances[2].onerror?.();
  assert.deepEqual(fixture.ackIds(), [31, 32]);
});

test('skip discards the active replay phase without ACKing or starting stale deferred events', (t) => {
  const fixture = createSessionFixture(t);

  fixture.start({ replayGameId: 'history-1' });
  fixture.emit(createAckEvent(41, 'skipped narration'));
  fixture.emit(createAckEvent(42, 'stale deferred narration'));
  const skippedCompletion = fixture.speechEnds[0];

  fixture.result.skipCurrentReplayPhase();
  assert.deepEqual(fixture.ackIds(), []);
  assert.deepEqual(fixture.controlActions(), ['skip-phase']);
  fixture.emit(createAckEvent(43, 'next server narration'));
  assert.deepEqual(fixture.appliedAckIds, [41, 43]);
  assert.deepEqual(fixture.spokenTexts, ['skipped narration', 'next server narration']);

  skippedCompletion();
  assert.deepEqual(fixture.ackIds(), []);
  fixture.speechEnds[1]();
  assert.deepEqual(fixture.ackIds(), [43]);
});

test('a stale completion cannot settle a new session that reuses the same ACK id', (t) => {
  const fixture = createSessionFixture(t);

  fixture.start();
  fixture.emit(createAckEvent(51, 'old session narration'));
  const staleCompletion = fixture.speechEnds[0];

  fixture.start();
  fixture.emit(createAckEvent(51, 'new session narration'));
  staleCompletion();
  assert.deepEqual(fixture.ackIds(), []);

  fixture.speechEnds[1]();
  fixture.speechEnds[1]();
  assert.deepEqual(fixture.ackIds(), [51]);
  assert.equal(fixture.acknowledgedCount(), 1);
});

type PlaybackKind = 'default' | 'debate' | 'werewolf';

function createSessionFixture(t: { after(callback: () => void): void }, playbackKind: PlaybackKind = 'default') {
  const timers = createFakeTimers();
  const spokenTexts: string[] = [];
  const speechEnds: Array<() => void> = [];
  const utterances: FakeSpeechUtterance[] = [];
  const appliedAckIds: Array<number | string> = [];
  const sent: Array<Record<string, unknown>> = [];
  let acknowledged = 0;
  let socketOptions: { onEvent(event: Record<string, unknown>, socket: unknown): void } | null = null;
  let socket: { readyState: number; send(payload: string): void; close(): void } | null = null;
  const originalWindow = globalThis.window;
  const originalWebSocket = globalThis.WebSocket;
  const originalSpeechSynthesisUtterance = globalThis.SpeechSynthesisUtterance;
  Object.assign(globalThis, {
    window: {
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
      speechSynthesis: {
        speak(utterance: FakeSpeechUtterance) { utterances.push(utterance); },
      },
    },
    WebSocket: class FakeWebSocket { static OPEN = 1; },
    SpeechSynthesisUtterance: FakeSpeechUtterance,
  });
  t.after(() => {
    Object.assign(globalThis, {
      window: originalWindow,
      WebSocket: originalWebSocket,
      SpeechSynthesisUtterance: originalSpeechSynthesisUtterance,
    });
  });

  const hooks = createHookHarness();
  const clientHooks = loadClientHooks(hooks.react, (options: typeof socketOptions) => {
    socketOptions = options;
    socket = {
      readyState: 1,
      send(payload: string) { sent.push(JSON.parse(payload) as Record<string, unknown>); },
      close() { this.readyState = 3; },
    };
    return socket;
  });
  let params: HookParams = {
    gameType: 'fixture',
    speechEnabled: true,
    speak(text: string, onEnd?: () => void) {
      spokenTexts.push(text);
      if (onEnd) speechEnds.push(onEnd);
      return true;
    },
    cancel() {},
    applyServerEvent(event: Record<string, unknown>) {
      appliedAckIds.push(event.ackId as number | string);
    },
    getNarration(event: Record<string, unknown>) { return String(event.message || ''); },
    getSpeechOptions() { return {}; },
    getAckDelay() { return 25; },
    onError() {},
    onAcknowledge() { acknowledged += 1; },
    onSkipPhase() {},
  };
  const useFixtureSession: SessionHook = (hookParams) => {
    const playbackRef = hooks.react.useRef(null) as {
      current: null | ((event: Record<string, unknown>, controls: Record<string, unknown>) => boolean);
    };
    const session = clientHooks.useGameSocketSession({
      ...hookParams,
      playPendingEvent(event: Record<string, unknown>, controls: Record<string, unknown>) {
        return playbackRef.current?.(event, controls) || false;
      },
    });
    if (playbackKind === 'debate') {
      const playback = clientHooks.useDebateSpeechPlayback({
        game: { players: [], phases: [] },
        speechEnabled: hookParams.speechEnabled,
        speak: hookParams.speak,
        setActiveSpeech() {},
        setSubtitleSpeech() {},
      });
      playbackRef.current = playback.playPendingDebateEvent;
    } else if (playbackKind === 'werewolf') {
      const playback = clientHooks.useWerewolfSpeechPlayback({
        game: { players: [], rounds: [] },
        speechEnabled: hookParams.speechEnabled,
        speak: hookParams.speak,
        setActiveSpeech() {},
      });
      playbackRef.current = playback.playPendingWerewolfEvent;
    }
    return session;
  };
  let result = hooks.render(useFixtureSession, params);

  return {
    timers,
    spokenTexts,
    speechEnds,
    utterances,
    appliedAckIds,
    get result() { return result; },
    start(payload: Record<string, unknown> = {}) {
      result.startSession(payload);
      result = hooks.render(useFixtureSession, params);
    },
    emit(event: Record<string, unknown>) {
      assert.ok(socketOptions);
      assert.ok(socket);
      socketOptions.onEvent(event, socket);
    },
    rerender() {
      result = hooks.render(useFixtureSession, params);
    },
    setSpeechEnabled(value: boolean) {
      params = { ...params, speechEnabled: value };
      result = hooks.render(useFixtureSession, params);
    },
    ackIds() {
      return sent.filter((payload) => payload.type === 'ack').map((payload) => payload.ackId);
    },
    controlActions() {
      return sent.filter((payload) => payload.type === 'control').map((payload) => payload.action);
    },
    acknowledgedCount() { return acknowledged; },
  };
}

function createAckEvent(ackId: number, message: string) {
  return { type: 'speech', ackId, message };
}

function createAudienceCueEvent(ackId: number, message: string) {
  return {
    type: 'workflow-event',
    ackId,
    message,
    audienceCue: {
      kind: 'rule-intro',
      display: 'modal',
      speech: 'browser',
      textField: 'message',
      once: true,
    },
  };
}

class FakeSpeechUtterance {
  lang = '';
  rate = 1;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(public readonly text: string) {}
}

function createFakeTimers() {
  let nextId = 1;
  const pending = new Map<number, () => void>();
  return {
    setTimeout(callback: () => void) {
      const id = nextId;
      nextId += 1;
      pending.set(id, callback);
      return id;
    },
    clearTimeout(id: number) { pending.delete(id); },
    pendingCount() { return pending.size; },
    runNext() {
      const next = pending.entries().next().value as [number, () => void] | undefined;
      assert.ok(next);
      pending.delete(next[0]);
      next[1]();
    },
  };
}

function createHookHarness() {
  const slots: Array<Record<string, unknown>> = [];
  let cursor = 0;
  let pendingEffects: Array<() => void> = [];
  const react = {
    useState(initialValue: unknown) {
      const index = cursor;
      cursor += 1;
      const slot = slots[index] || (slots[index] = { value: initialValue });
      return [slot.value, (nextValue: unknown) => {
        slot.value = typeof nextValue === 'function'
          ? (nextValue as (current: unknown) => unknown)(slot.value)
          : nextValue;
      }];
    },
    useRef(initialValue: unknown) {
      const index = cursor;
      cursor += 1;
      return slots[index] || (slots[index] = { current: initialValue });
    },
    useEffect(effect: () => Cleanup, dependencies: unknown[] = []) {
      const index = cursor;
      cursor += 1;
      const slot = slots[index] || (slots[index] = {});
      const previous = slot.dependencies as unknown[] | undefined;
      const changed = !previous
        || previous.length !== dependencies.length
        || dependencies.some((dependency, dependencyIndex) => !Object.is(dependency, previous[dependencyIndex]));
      if (!changed) return;
      pendingEffects.push(() => {
        (slot.cleanup as (() => void) | undefined)?.();
        slot.dependencies = [...dependencies];
        slot.cleanup = effect() || undefined;
      });
    },
  };

  return {
    react,
    render(hook: SessionHook, params: HookParams) {
      cursor = 0;
      const result = hook(params);
      const effects = pendingEffects;
      pendingEffects = [];
      effects.forEach((effect) => effect());
      return result;
    },
  };
}

function loadClientHooks(react: Record<string, unknown>, openGameSocket: (options: never) => unknown) {
  const hookPaths = [
    require.resolve('../../packages/client/src/hooks/useGameSocketSession'),
    require.resolve('../../packages/client/src/hooks/useSpeechPlayback'),
    require.resolve('../../packages/client/src/features/debate/hooks/useDebateSpeechPlayback'),
    require.resolve('../../packages/client/src/features/werewolf/hooks/useWerewolfSpeechPlayback'),
  ];
  const [sessionHookPath, sharedPlaybackPath, debatePlaybackPath, werewolfPlaybackPath] = hookPaths;
  const createRequire = require('node:module').createRequire as (filename: string) => NodeRequire;
  const reactPaths = [...new Set(hookPaths.map((hookPath) => createRequire(hookPath).resolve('react')))];
  const servicePath = require.resolve('../../packages/client/src/services/gameService');
  const debateUtilsPath = require.resolve('../../packages/client/src/features/debate/utils/index.ts');
  const werewolfUtilsPath = require.resolve('../../packages/client/src/features/werewolf/utils/index.ts');
  const cachedReact = new Map(reactPaths.map((reactPath) => [reactPath, require.cache[reactPath]]));
  const reactExports = Object.assign({}, require(reactPaths[0]), react);
  const cachedService = require.cache[servicePath];
  const cachedDebateUtils = require.cache[debateUtilsPath];
  const cachedWerewolfUtils = require.cache[werewolfUtilsPath];
  const cachedHooks = new Map(hookPaths.map((hookPath) => [hookPath, require.cache[hookPath]]));
  reactPaths.forEach((reactPath) => {
    require.cache[reactPath] = createMockModule(reactPath, reactExports);
  });
  require.cache[servicePath] = createMockModule(servicePath, { openGameSocket });
  require.cache[debateUtilsPath] = createMockModule(debateUtilsPath, {
    getDebateNarration: (event: Record<string, unknown>) => String(event.narration || event.message || ''),
  });
  require.cache[werewolfUtilsPath] = createMockModule(werewolfUtilsPath, {
    getWerewolfNarration: (event: Record<string, unknown>) => String(event.narration || event.message || ''),
  });
  hookPaths.forEach((hookPath) => delete require.cache[hookPath]);
  try {
    require(sharedPlaybackPath);
    return {
      useGameSocketSession: require(sessionHookPath).useGameSocketSession as SessionHook,
      useDebateSpeechPlayback: require(debatePlaybackPath).useDebateSpeechPlayback as SessionHook,
      useWerewolfSpeechPlayback: require(werewolfPlaybackPath).useWerewolfSpeechPlayback as SessionHook,
    };
  } finally {
    reactPaths.forEach((reactPath) => {
      const cachedModule = cachedReact.get(reactPath);
      if (cachedModule) require.cache[reactPath] = cachedModule;
      else delete require.cache[reactPath];
    });
    if (cachedService) require.cache[servicePath] = cachedService;
    else delete require.cache[servicePath];
    if (cachedDebateUtils) require.cache[debateUtilsPath] = cachedDebateUtils;
    else delete require.cache[debateUtilsPath];
    if (cachedWerewolfUtils) require.cache[werewolfUtilsPath] = cachedWerewolfUtils;
    else delete require.cache[werewolfUtilsPath];
    hookPaths.forEach((hookPath) => {
      const cachedModule = cachedHooks.get(hookPath);
      if (cachedModule) require.cache[hookPath] = cachedModule;
      else delete require.cache[hookPath];
    });
  }
}

function createMockModule(filename: string, exports: unknown): NodeModule {
  return {
    id: filename,
    path: filename,
    exports,
    filename,
    loaded: true,
    children: [],
    paths: [],
    isPreloading: false,
    require,
  } as NodeModule;
}
