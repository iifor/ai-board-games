import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_WEREWOLF_MODES,
  DEFAULT_WEREWOLF_ROLES,
  EXECUTABLE_WEREWOLF_ACTIONS,
} from '../../packages/server/db/seed';

function roleCount(modeId: string, roleId: string): number {
  const mode = DEFAULT_WEREWOLF_MODES.find((item) => item.id === modeId);
  assert.ok(mode, `${modeId} should exist`);
  return Number(mode.roles.find((item) => item.roleId === roleId)?.count || 0);
}

function totalPlayers(modeId: string): number {
  const mode = DEFAULT_WEREWOLF_MODES.find((item) => item.id === modeId);
  assert.ok(mode, `${modeId} should exist`);
  return mode.roles.reduce((sum, item) => sum + Number(item.count || 0), 0);
}

test('default werewolf config includes white wolf king guard 12-player mode', () => {
  const role = DEFAULT_WEREWOLF_ROLES.find((item) => item.id === 'white_wolf_king');
  assert.equal(role?.faction, 'wolves');
  assert.equal(role?.roleType, 'wolf');
  assert.equal(EXECUTABLE_WEREWOLF_ACTIONS.has('selfDestruct'), true);

  const mode = DEFAULT_WEREWOLF_MODES.find((item) => item.id === 'white-wolf-king-guard-12');
  assert.equal(mode?.name, '白狼王守卫（12人）');
  assert.equal(totalPlayers('white-wolf-king-guard-12'), 12);
  assert.equal(roleCount('white-wolf-king-guard-12', 'werewolf'), 3);
  assert.equal(roleCount('white-wolf-king-guard-12', 'white_wolf_king'), 1);
  assert.equal(roleCount('white-wolf-king-guard-12', 'villager'), 4);
  assert.equal(roleCount('white-wolf-king-guard-12', 'seer'), 1);
  assert.equal(roleCount('white-wolf-king-guard-12', 'witch'), 1);
  assert.equal(roleCount('white-wolf-king-guard-12', 'hunter'), 1);
  assert.equal(roleCount('white-wolf-king-guard-12', 'guard'), 1);
});

test('guard-12 remains the prophet witch hunter guard 12-player lineup', () => {
  const mode = DEFAULT_WEREWOLF_MODES.find((item) => item.id === 'guard-12');
  assert.equal(mode?.name, '预女猎守（12人）');
  assert.match(String(mode?.description || ''), /4村民/);
  assert.equal(totalPlayers('guard-12'), 12);
  assert.equal(roleCount('guard-12', 'werewolf'), 4);
  assert.equal(roleCount('guard-12', 'villager'), 4);
});
