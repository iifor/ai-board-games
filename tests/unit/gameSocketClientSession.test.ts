import assert from 'node:assert/strict';
import test from 'node:test';

type Cleanup = void | (() => void);
type HookParams = Record<string, unknown>;
type SessionHook = (params: HookParams) => Record<string, (...args: never[]) => unknown>;

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

function createSessionFixture(t: { after(callback: () => void): void }) {
  const timers = createFakeTimers();
  const spokenTexts: string[] = [];
  const speechEnds: Array<() => void> = [];
  const appliedAckIds: Array<number | string> = [];
  const sent: Array<Record<string, unknown>> = [];
  let acknowledged = 0;
  let socketOptions: { onEvent(event: Record<string, unknown>, socket: unknown): void } | null = null;
  const socket = {
    readyState: 1,
    send(payload: string) { sent.push(JSON.parse(payload) as Record<string, unknown>); },
    close() { this.readyState = 3; },
  };
  const originalWindow = globalThis.window;
  const originalWebSocket = globalThis.WebSocket;
  Object.assign(globalThis, {
    window: {
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
    },
    WebSocket: class FakeWebSocket { static OPEN = 1; },
  });
  t.after(() => {
    Object.assign(globalThis, { window: originalWindow, WebSocket: originalWebSocket });
  });

  const hooks = createHookHarness();
  const useGameSocketSession = loadSessionHook(hooks.react, (options: typeof socketOptions) => {
    socketOptions = options;
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
    playPendingEvent() { return false; },
    onError() {},
    onAcknowledge() { acknowledged += 1; },
    onSkipPhase() {},
  };
  let result = hooks.render(useGameSocketSession, params);

  return {
    timers,
    spokenTexts,
    speechEnds,
    appliedAckIds,
    get result() { return result; },
    start() {
      result.startSession();
      result = hooks.render(useGameSocketSession, params);
    },
    emit(event: Record<string, unknown>) {
      assert.ok(socketOptions);
      socketOptions.onEvent(event, socket);
    },
    rerender() {
      result = hooks.render(useGameSocketSession, params);
    },
    setSpeechEnabled(value: boolean) {
      params = { ...params, speechEnabled: value };
      result = hooks.render(useGameSocketSession, params);
    },
    ackIds() {
      return sent.filter((payload) => payload.type === 'ack').map((payload) => payload.ackId);
    },
    acknowledgedCount() { return acknowledged; },
  };
}

function createAckEvent(ackId: number, message: string) {
  return { type: 'speech', ackId, message };
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

function loadSessionHook(react: Record<string, unknown>, openGameSocket: (options: never) => unknown): SessionHook {
  const hookPath = require.resolve('../../packages/client/src/hooks/useGameSocketSession');
  const reactPath = require('node:module').createRequire(hookPath).resolve('react');
  const servicePath = require.resolve('../../packages/client/src/services/gameService');
  const cachedReact = require.cache[reactPath];
  const cachedService = require.cache[servicePath];
  const cachedHook = require.cache[hookPath];
  require.cache[reactPath] = createMockModule(reactPath, react);
  require.cache[servicePath] = createMockModule(servicePath, { openGameSocket });
  delete require.cache[hookPath];
  try {
    return require(hookPath).useGameSocketSession as SessionHook;
  } finally {
    if (cachedReact) require.cache[reactPath] = cachedReact;
    else delete require.cache[reactPath];
    if (cachedService) require.cache[servicePath] = cachedService;
    else delete require.cache[servicePath];
    if (cachedHook) require.cache[hookPath] = cachedHook;
    else delete require.cache[hookPath];
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
