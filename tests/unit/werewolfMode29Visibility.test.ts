import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveActionChannel } from '../../packages/server/modules/werewolf/handlers/actionChannel';
import { matchScope } from '../../packages/server/modules/werewolf/views/informationLayer';
import { projectWerewolfGame } from '../../packages/server/modules/werewolf/views/viewPolicy';

test('mode 29 hunter team actions use the private escape hunter channel', () => {
  assert.deepEqual(resolveActionChannel('escape_hunter_speech'), {
    channel: 'scope',
    scopeKey: 'escape_hunters',
  });
  assert.deepEqual(resolveActionChannel('escape_hunter_vote'), {
    channel: 'scope',
    scopeKey: 'escape_hunters',
  });
});

test('only escape hunters can access the escape hunter channel', () => {
  assert.equal(matchScope('escape_hunters', {
    type: 'player',
    faction: 'hunters',
    roles: ['escape_hunter'],
  }), true);
  assert.equal(matchScope('escape_hunters', {
    type: 'player',
    faction: 'good',
    roles: ['seer'],
  }), false);
});

test('player projection keeps hunter team night data private', () => {
  const game = {
    players: [
      { id: 1, role: 'escape_hunter', roleLabel: '猎人', faction: 'hunters', alive: true },
      { id: 2, role: 'escape_hunter', roleLabel: '猎人', faction: 'hunters', alive: true },
      { id: 3, role: 'seer', roleLabel: '预言家', faction: 'good', alive: true },
    ],
    rounds: [{
      day: 1,
      nightRevealed: false,
      night: {
        escapeHunterIds: [1, 2],
        escapeHunterSpeechOrder: [1, 2],
        escapeHunterSpeeches: [{ playerId: 1, text: '猎杀3号' }],
        escapeHunterChoices: { 1: 3, 2: 3 },
        escapeHunterVoteTally: { 3: 2 },
        escapeHunterTarget: 3,
        deaths: [],
      },
    }],
  };

  const hunterView = projectWerewolfGame(game, {
    mode: 'player',
    viewerPlayerId: 1,
    viewerRoleId: 'escape_hunter',
    viewerFaction: 'hunters',
  }) as typeof game;
  const seerView = projectWerewolfGame(game, {
    mode: 'player',
    viewerPlayerId: 3,
    viewerRoleId: 'seer',
    viewerFaction: 'good',
  }) as typeof game;

  assert.equal(hunterView.players[1].role, 'escape_hunter');
  assert.equal(hunterView.rounds[0].night.escapeHunterTarget, 3);
  assert.deepEqual(hunterView.rounds[0].night.escapeHunterChoices, { 1: 3, 2: 3 });
  assert.equal(seerView.players[1].role, undefined);
  assert.equal(seerView.rounds[0].night.escapeHunterTarget, null);
  assert.deepEqual(seerView.rounds[0].night.escapeHunterChoices, {});
});
