import test from 'node:test';
import assert from 'node:assert/strict';
import { getWerewolfNarration } from '../../packages/server/modules/game-socket/narration';
import { buildWerewolfReplayPlaybackEvents } from '../../packages/server/modules/game-socket/replay';

test('werewolf narration keeps saved seer and guard speech unchanged', () => {
  assert.equal(
    getWerewolfNarration({
      type: 'seer-check',
      seerCheck: { target: 5, result: '狼人', reason: '我验了5号，他果然是狼人。' },
    } as never),
    '我验了5号，他果然是狼人。',
  );
  assert.equal(
    getWerewolfNarration({
      type: 'guard-action',
      guardAction: { target: 2, reason: '我今晚守护2号，他像关键神职。' },
    } as never),
    '我今晚守护2号，他像关键神职。',
  );
});

test('werewolf narration keeps existing fixed fallbacks without saved speech', () => {
  assert.equal(
    getWerewolfNarration({ type: 'seer-check', seerCheck: { target: 5, result: '狼人' } } as never),
    '5号玩家的身份是：狼人。',
  );
  assert.equal(
    getWerewolfNarration({ type: 'guard-action', guardAction: { target: 2 } } as never),
    '守卫守护了2号。',
  );
});

test('werewolf replay reconstructs saved seer and guard speech unchanged', () => {
  const events = buildWerewolfReplayPlaybackEvents({
    type: 'werewolf',
    players: [
      { id: 1, role: 'seer', alive: true },
      { id: 2, role: 'guard', alive: true },
      { id: 5, role: 'werewolf', alive: true },
    ],
    rounds: [{
      day: 1,
      night: {
        seerCheck: { target: 5, result: '狼人', reason: '我验了5号，他果然是狼人。' },
        guardTarget: 2,
        guardReason: '我今晚守护2号，他像关键神职。',
      },
    }],
  } as never);

  const seerEvent = events.find((event) => event.type === 'seer-check');
  const guardEvent = events.find((event) => event.type === 'guard-action');

  assert.equal(seerEvent?.message, '我验了5号，他果然是狼人。');
  assert.equal((seerEvent?.speech as { text?: string } | undefined)?.text, '我验了5号，他果然是狼人。');
  assert.equal(guardEvent?.message, '我今晚守护2号，他像关键神职。');
  assert.doesNotMatch(String(seerEvent?.message), /5号玩家的身份是/);
  assert.doesNotMatch(String(guardEvent?.message), /守卫守护了2号/);
});

test('werewolf replay keeps saved witch speech unchanged', () => {
  const events = buildWerewolfReplayPlaybackEvents({
    type: 'werewolf',
    players: [{ id: 3, role: 'witch', alive: true }],
    rounds: [{
      day: 1,
      night: {
        wolfTarget: 5,
        witchSave: true,
        witchSaveTarget: 5,
        witchSaveReason: '我今晚用解药救下5号。',
        witchPoisonTarget: 6,
        witchPoisonReason: '我确定6号是狼，所以毒他。',
      },
    }],
  } as never);

  const witchEvents = events.filter((event) => event.type === 'witch-action');
  const saveEvent = witchEvents.find((event) => event.actionType === 'witch_save');
  const poisonEvent = witchEvents.find((event) => event.actionType === 'witch_poison');

  assert.equal(saveEvent?.message, '我今晚用解药救下5号。');
  assert.equal((saveEvent?.speech as { text?: string } | undefined)?.text, '我今晚用解药救下5号。');
  assert.equal(poisonEvent?.message, '我确定6号是狼，所以毒他。');
  assert.equal((poisonEvent?.speech as { text?: string } | undefined)?.text, '我确定6号是狼，所以毒他。');
});

test('werewolf replay keeps fixed witch fallbacks without saved speech', () => {
  const events = buildWerewolfReplayPlaybackEvents({
    type: 'werewolf',
    players: [{ id: 3, role: 'witch', alive: true }],
    rounds: [{
      day: 1,
      night: {
        wolfTarget: 5,
        witchSave: true,
        witchSaveTarget: 5,
        witchPoisonTarget: 6,
      },
    }],
  } as never);

  const witchEvents = events.filter((event) => event.type === 'witch-action');
  const saveEvent = witchEvents.find((event) => event.actionType === 'witch_save');
  const poisonEvent = witchEvents.find((event) => event.actionType === 'witch_poison');

  assert.equal(saveEvent?.message, '女巫使用了解药。');
  assert.equal((saveEvent?.speech as { text?: string } | undefined)?.text, '女巫使用了解药。');
  assert.equal(poisonEvent?.message, '女巫毒了6号。');
  assert.equal((poisonEvent?.speech as { text?: string } | undefined)?.text, '女巫毒了6号。');
});
