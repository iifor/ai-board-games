import assert from 'node:assert/strict';
import test from 'node:test';
import { resetGameEngine } from '../../packages/server/modules/engine-registry';
import { resolveGameRunner } from '../../packages/server/modules/game-socket/gameRunner';
import { selectPlayersForGame } from '../../packages/server/modules/game-socket/service';

test('registered undercover resolves through generic runtime metadata', () => {
  resetGameEngine();
  const resolved = resolveGameRunner('undercover');

  assert.equal(resolved.gameType, 'undercover');
  assert.equal(resolved.session.startMessage, '谁是卧底开始');
  assert.equal(resolved.session.doneMessage, '谁是卧底结束，身份已经揭晓。');
  assert.equal(typeof resolved.run, 'function');
});

test('unknown games fail instead of falling back to werewolf', () => {
  resetGameEngine();

  assert.throws(() => resolveGameRunner('not-a-game'), /GameDefinition not registered/);
});

test('registered player selection metadata validates undercover without a game branch', () => {
  resetGameEngine();
  const players = Array.from({ length: 7 }, (_, index) => ({ id: index + 1 }));

  assert.throws(
    () => selectPlayersForGame(
      { host: {}, players, missingProviders: [] },
      players.map((player) => player.id),
      'undercover',
    ),
    /AI 谁是卧底需要选择恰好 6 位 AI 玩家/,
  );
});

test('legacy runners preserve definition-backed session metadata', () => {
  resetGameEngine();

  const debate = resolveGameRunner('debate');
  assert.equal(debate.session.startMessage, '辩论赛开始');
  assert.equal(debate.session.doneMessage, '辩论赛结束，完整赛果已生成。');
  assert.deepEqual(debate.session.playback, { phaseLookahead: 1 });

  const werewolf = resolveGameRunner('werewolf');
  assert.equal(werewolf.session.startMessage, '游戏开始');
  assert.equal(werewolf.session.doneMessage, '狼人杀结束，完整战报已生成。');
  assert.deepEqual(werewolf.session.playback, { prefetchCount: 2 });
});
