import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_WEREWOLF_MODES,
  DEFAULT_WEREWOLF_ROLES,
  EXECUTABLE_WEREWOLF_ACTIONS,
} from '../../packages/server/db/seed';
import { normalizeWerewolfFaction } from '../../packages/server/modules/werewolf-config/utils';

function roleCount(modeId: string, roleId: string): number {
  const mode = DEFAULT_WEREWOLF_MODES.find((item) => item.id === modeId);
  assert.ok(mode, `${modeId} should exist`);
  return Number(mode.roles.find((item) => item.roleId === roleId)?.count || 0);
}

test('all default werewolf modes reference defined roles', () => {
  const roleIds = new Set(DEFAULT_WEREWOLF_ROLES.map((role) => role.id));
  for (const mode of DEFAULT_WEREWOLF_MODES) {
    for (const entry of mode.roles) {
      assert.ok(roleIds.has(entry.roleId), `${mode.id} references missing role ${entry.roleId}`);
    }
  }
});

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
  assert.equal(mode?.description, mode?.name);
  assert.equal(totalPlayers('guard-12'), 12);
  assert.equal(roleCount('guard-12', 'werewolf'), 4);
  assert.equal(roleCount('guard-12', 'villager'), 4);
});

test('default werewolf config includes dreamer 12-player mode', () => {
  const dreamer = DEFAULT_WEREWOLF_ROLES.find((item) => item.id === 'dreamer');
  assert.equal(dreamer?.faction, 'good');
  assert.equal(dreamer?.roleType, 'god');
  assert.equal(EXECUTABLE_WEREWOLF_ACTIONS.has('dream'), true);

  assert.equal(totalPlayers('dreamer-12'), 12);
  assert.equal(roleCount('dreamer-12', 'werewolf'), 4);
  assert.equal(roleCount('dreamer-12', 'seer'), 1);
  assert.equal(roleCount('dreamer-12', 'witch'), 1);
  assert.equal(roleCount('dreamer-12', 'hunter'), 1);
  assert.equal(roleCount('dreamer-12', 'dreamer'), 1);
  assert.equal(roleCount('dreamer-12', 'villager'), 4);
});

test('default werewolf config includes magician 12-player mode', () => {
  const magician = DEFAULT_WEREWOLF_ROLES.find((item) => item.id === 'magician');
  assert.equal(magician?.faction, 'good');
  assert.equal(magician?.roleType, 'god');
  assert.equal(magician?.rule.actions[0]?.action, 'swap');

  assert.equal(totalPlayers('magician-12'), 12);
  assert.equal(roleCount('magician-12', 'werewolf'), 4);
  assert.equal(roleCount('magician-12', 'seer'), 1);
  assert.equal(roleCount('magician-12', 'witch'), 1);
  assert.equal(roleCount('magician-12', 'hunter'), 1);
  assert.equal(roleCount('magician-12', 'magician'), 1);
  assert.equal(roleCount('magician-12', 'villager'), 4);
});

test('default werewolf config includes modes 14 to 16', () => {
  for (const action of ['mark', 'soloKill', 'curse', 'bearRoar']) {
    assert.equal(EXECUTABLE_WEREWOLF_ACTIONS.has(action), true, `${action} should be executable`);
  }

  assert.equal(totalPlayers('big-bad-wolf-fortune-teller-12'), 12);
  assert.equal(roleCount('big-bad-wolf-fortune-teller-12', 'big_bad_wolf'), 1);
  assert.equal(roleCount('big-bad-wolf-fortune-teller-12', 'werewolf'), 3);
  assert.equal(roleCount('big-bad-wolf-fortune-teller-12', 'fortune_teller'), 1);
  assert.equal(roleCount('big-bad-wolf-fortune-teller-12', 'villager'), 4);

  assert.equal(totalPlayers('hidden-wolf-crow-12'), 12);
  assert.equal(roleCount('hidden-wolf-crow-12', 'hidden_wolf'), 1);
  assert.equal(roleCount('hidden-wolf-crow-12', 'werewolf'), 3);
  assert.equal(roleCount('hidden-wolf-crow-12', 'crow'), 1);
  assert.equal(roleCount('hidden-wolf-crow-12', 'villager'), 4);

  assert.equal(totalPlayers('bear-tamer-hidden-wolf-12'), 12);
  assert.equal(roleCount('bear-tamer-hidden-wolf-12', 'hidden_wolf'), 1);
  assert.equal(roleCount('bear-tamer-hidden-wolf-12', 'werewolf'), 3);
  assert.equal(roleCount('bear-tamer-hidden-wolf-12', 'bear_tamer'), 1);
  assert.equal(roleCount('bear-tamer-hidden-wolf-12', 'idiot'), 1);
  assert.equal(roleCount('bear-tamer-hidden-wolf-12', 'villager'), 4);
});

test('default werewolf config includes modes 17 to 19', () => {
  for (const action of ['chooseMaster', 'blastVoters', 'loseTailOnGoodDeath']) {
    assert.equal(EXECUTABLE_WEREWOLF_ACTIONS.has(action), true, `${action} should be executable`);
  }

  const wildChild = DEFAULT_WEREWOLF_ROLES.find((item) => item.id === 'wild_child');
  const bombman = DEFAULT_WEREWOLF_ROLES.find((item) => item.id === 'bombman');
  const nineTailedFox = DEFAULT_WEREWOLF_ROLES.find((item) => item.id === 'nine_tailed_fox');
  assert.equal(wildChild?.roleType, 'villager');
  assert.equal(bombman?.roleType, 'god');
  assert.equal(nineTailedFox?.roleType, 'god');

  assert.equal(totalPlayers('wild-child-12'), 12);
  assert.equal(roleCount('wild-child-12', 'wild_child'), 1);
  assert.equal(roleCount('wild-child-12', 'werewolf'), 4);
  assert.equal(roleCount('wild-child-12', 'villager'), 4);

  assert.equal(totalPlayers('bombman-12'), 12);
  assert.equal(roleCount('bombman-12', 'werewolf'), 4);
  assert.equal(roleCount('bombman-12', 'bombman'), 1);
  assert.equal(roleCount('bombman-12', 'villager'), 4);

  assert.equal(totalPlayers('nine-tailed-fox-12'), 12);
  assert.equal(roleCount('nine-tailed-fox-12', 'werewolf'), 4);
  assert.equal(roleCount('nine-tailed-fox-12', 'nine_tailed_fox'), 1);
  assert.equal(roleCount('nine-tailed-fox-12', 'villager'), 4);
});

test('default werewolf config includes animal zoo mode', () => {
  for (const action of ['freeze', 'foxInspect']) {
    assert.equal(EXECUTABLE_WEREWOLF_ACTIONS.has(action), true, `${action} should be executable`);
  }

  const penguin = DEFAULT_WEREWOLF_ROLES.find((item) => item.id === 'penguin');
  const fox = DEFAULT_WEREWOLF_ROLES.find((item) => item.id === 'fox');
  const rabbit = DEFAULT_WEREWOLF_ROLES.find((item) => item.id === 'rabbit');
  assert.equal(penguin?.roleType, 'god');
  assert.equal(fox?.roleType, 'god');
  assert.equal(rabbit?.roleType, 'villager');

  assert.equal(totalPlayers('animal-zoo-12'), 12);
  assert.equal(roleCount('animal-zoo-12', 'wolf_king'), 1);
  assert.equal(roleCount('animal-zoo-12', 'werewolf'), 3);
  assert.equal(roleCount('animal-zoo-12', 'bear_tamer'), 1);
  assert.equal(roleCount('animal-zoo-12', 'penguin'), 1);
  assert.equal(roleCount('animal-zoo-12', 'crow'), 1);
  assert.equal(roleCount('animal-zoo-12', 'fox'), 1);
  assert.equal(roleCount('animal-zoo-12', 'rabbit'), 4);
});

test('default werewolf config includes firepower mode', () => {
  const sapling = DEFAULT_WEREWOLF_ROLES.find((item) => item.id === 'sapling');
  assert.equal(sapling?.faction, 'good');
  assert.equal(sapling?.roleType, 'villager');

  assert.equal(totalPlayers('firepower-12'), 12);
  assert.equal(roleCount('firepower-12', 'white_wolf_king'), 1);
  assert.equal(roleCount('firepower-12', 'demon'), 1);
  assert.equal(roleCount('firepower-12', 'wolf_beauty'), 1);
  assert.equal(roleCount('firepower-12', 'hidden_wolf'), 1);
  assert.equal(roleCount('firepower-12', 'fox'), 1);
  assert.equal(roleCount('firepower-12', 'witch'), 1);
  assert.equal(roleCount('firepower-12', 'hunter'), 1);
  assert.equal(roleCount('firepower-12', 'guard'), 1);
  assert.equal(roleCount('firepower-12', 'idiot'), 1);
  assert.equal(roleCount('firepower-12', 'big_tree'), 1);
  assert.equal(roleCount('firepower-12', 'sapling'), 2);
});

test('default werewolf config includes magic wolf demon hunter mode', () => {
  const magicWolf = DEFAULT_WEREWOLF_ROLES.find((item) => item.id === 'magic_wolf');
  const demonHunter = DEFAULT_WEREWOLF_ROLES.find((item) => item.id === 'demon_hunter');

  assert.equal(magicWolf?.faction, 'wolves');
  assert.equal(magicWolf?.roleType, 'wolf');
  assert.equal(magicWolf?.rule.actions.some((action) => action.action === 'selfDestruct'), true);
  assert.equal(demonHunter?.faction, 'good');
  assert.equal(demonHunter?.roleType, 'god');
  assert.equal(demonHunter?.rule.actions.some((action) => action.action === 'demonHunterHunt'), true);
  assert.equal(EXECUTABLE_WEREWOLF_ACTIONS.has('demonHunterHunt'), true);

  assert.equal(totalPlayers('magic-wolf-demon-hunter-12'), 12);
  assert.equal(roleCount('magic-wolf-demon-hunter-12', 'magic_wolf'), 1);
  assert.equal(roleCount('magic-wolf-demon-hunter-12', 'werewolf'), 3);
  assert.equal(roleCount('magic-wolf-demon-hunter-12', 'seer'), 1);
  assert.equal(roleCount('magic-wolf-demon-hunter-12', 'witch'), 1);
  assert.equal(roleCount('magic-wolf-demon-hunter-12', 'demon_hunter'), 1);
  assert.equal(roleCount('magic-wolf-demon-hunter-12', 'idiot'), 1);
  assert.equal(roleCount('magic-wolf-demon-hunter-12', 'villager'), 4);
});

test('default werewolf config includes spirit wolf mode', () => {
  const spiritWolf = DEFAULT_WEREWOLF_ROLES.find((item) => item.id === 'spirit_wolf');

  assert.equal(spiritWolf?.faction, 'wolves');
  assert.equal(spiritWolf?.roleType, 'wolf');
  for (const action of ['spiritWolfLearn', 'spiritWolfInspect', 'spiritWolfGuard', 'spiritWolfAntidote']) {
    assert.equal(spiritWolf?.rule.actions.some((item) => item.action === action), true);
    assert.equal(EXECUTABLE_WEREWOLF_ACTIONS.has(action), true);
  }

  assert.equal(totalPlayers('spirit-wolf-12'), 12);
  assert.equal(roleCount('spirit-wolf-12', 'spirit_wolf'), 1);
  assert.equal(roleCount('spirit-wolf-12', 'werewolf'), 3);
  assert.equal(roleCount('spirit-wolf-12', 'seer'), 1);
  assert.equal(roleCount('spirit-wolf-12', 'witch'), 1);
  assert.equal(roleCount('spirit-wolf-12', 'hunter'), 1);
  assert.equal(roleCount('spirit-wolf-12', 'guard'), 1);
  assert.equal(roleCount('spirit-wolf-12', 'villager'), 4);
});

test('default werewolf config includes illusionist wolf witch mode', () => {
  const wolfWitch = DEFAULT_WEREWOLF_ROLES.find((item) => item.id === 'wolf_witch');
  const illusionist = DEFAULT_WEREWOLF_ROLES.find((item) => item.id === 'illusionist');

  assert.equal(wolfWitch?.faction, 'wolves');
  assert.equal(wolfWitch?.roleType, 'wolf');
  assert.equal(wolfWitch?.rule.actions.some((item) => item.action === 'wolfWitchCurse'), true);
  assert.equal(illusionist?.faction, 'good');
  assert.equal(illusionist?.roleType, 'god');
  assert.equal(illusionist?.rule.actions.some((item) => item.action === 'illusion'), true);
  assert.equal(EXECUTABLE_WEREWOLF_ACTIONS.has('wolfWitchCurse'), true);
  assert.equal(EXECUTABLE_WEREWOLF_ACTIONS.has('illusion'), true);

  assert.equal(totalPlayers('illusionist-wolf-witch-12'), 12);
  assert.equal(roleCount('illusionist-wolf-witch-12', 'wolf_witch'), 1);
  assert.equal(roleCount('illusionist-wolf-witch-12', 'werewolf'), 3);
  assert.equal(roleCount('illusionist-wolf-witch-12', 'seer'), 1);
  assert.equal(roleCount('illusionist-wolf-witch-12', 'witch'), 1);
  assert.equal(roleCount('illusionist-wolf-witch-12', 'hunter'), 1);
  assert.equal(roleCount('illusionist-wolf-witch-12', 'illusionist'), 1);
  assert.equal(roleCount('illusionist-wolf-witch-12', 'villager'), 4);
});

test('default werewolf config includes wolf escape mode 29', () => {
  const mode = DEFAULT_WEREWOLF_MODES.find((item) => item.id === 'wolf-escape-10');
  const escapeHunter = DEFAULT_WEREWOLF_ROLES.find((item) => item.id === 'escape_hunter');
  const tamedWerewolf = DEFAULT_WEREWOLF_ROLES.find((item) => item.id === 'tamed_werewolf');
  const thickWolf = DEFAULT_WEREWOLF_ROLES.find((item) => item.id === 'thick_wolf');

  assert.ok(mode);
  assert.equal(mode.winCondition, 'wolf_escape');
  assert.equal(totalPlayers('wolf-escape-10'), 10);
  assert.equal(roleCount('wolf-escape-10', 'escape_hunter'), 3);
  assert.equal(roleCount('wolf-escape-10', 'seer'), 1);
  assert.equal(roleCount('wolf-escape-10', 'witch'), 1);
  assert.equal(roleCount('wolf-escape-10', 'thick_wolf'), 1);
  assert.equal(roleCount('wolf-escape-10', 'tamed_werewolf'), 2);
  assert.equal(roleCount('wolf-escape-10', 'villager'), 2);

  assert.equal(escapeHunter?.faction, 'hunters');
  assert.equal(normalizeWerewolfFaction('hunters'), 'hunters');
  assert.equal(escapeHunter?.rule.actions.some((item) => item.action === 'hunterHunt'), true);
  assert.equal(escapeHunter?.rule.actions.some((item) => item.action === 'shootOnDeath'), true);
  assert.equal(tamedWerewolf?.faction, 'good');
  assert.equal(thickWolf?.faction, 'good');
  assert.equal(EXECUTABLE_WEREWOLF_ACTIONS.has('hunterHunt'), true);
});
