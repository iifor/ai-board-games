import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createSession, isSpeechWaitPayload } from '../../packages/server/modules/game-socket/session';
import { createPreparedSender, isImmediateEvent, isRuleIntroEvent } from '../../packages/server/modules/game-socket/sender';

interface SentPayload {
  type?: string;
  ackId?: number;
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

test('PreparedSender waits for rule intro ack before sending later events', async () => {
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
    message: '本局游戏：标准局。',
    audienceCue: { kind: 'rule-intro', display: 'modal', speech: 'browser', textField: 'text', once: true },
  });
  await sender.enqueue({
    type: 'workflow-event',
    workflowEvent: 'action-requested',
    actionType: 'wolf_vote',
    message: '',
    presentation: { suppressSpeech: true },
  });
  await waitFor(() => sent.length === 1);

  assert.equal(sent.length, 1);
  assert.equal(sent[0].ackId, 1);
  assert.equal(sent[0].audienceCue?.kind, 'rule-intro');

  waiters[0]();
  await waitFor(() => sent.length === 2);

  assert.equal(sent[1].workflowEvent, 'action-requested');
  assert.equal(sent[1].ackId, undefined);
});

test('PreparedSender keeps speech events waitable while ordinary workflow events are immediate', () => {
  assert.equal(isRuleIntroEvent({ audienceCue: { kind: 'rule-intro' } }), true);
  assert.equal(isImmediateEvent({ type: 'workflow-event', workflowEvent: 'phase-changed', audienceCue: { kind: 'rule-intro' } }), false);
  assert.equal(isImmediateEvent({ type: 'workflow-event', workflowEvent: 'action-requested' }), true);
  assert.equal(isImmediateEvent({ type: 'workflow-event', workflowEvent: 'action-submitted', speech: { text: '狼人发言' } }), false);
});

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.equal(predicate(), true);
}
