const MAX_DAYS = 5;

const FACTION_GOOD = 'good';
const FACTION_WOLVES = 'wolves';

const ROLE_TYPE_GOD = 'god';
const ROLE_TYPE_WOLF = 'wolf';
const ROLE_TYPE_VILLAGER = 'villager';

const EXECUTABLE_WEREWOLF_ACTIONS = new Set([
  'kill', 'inspectFaction', 'save', 'poison', 'guard',
  'shootOnDeath', 'surviveExileOnce', 'voteOnly', 'speakOnly'
]);

module.exports = {
  MAX_DAYS, FACTION_GOOD, FACTION_WOLVES,
  ROLE_TYPE_GOD, ROLE_TYPE_WOLF, ROLE_TYPE_VILLAGER,
  EXECUTABLE_WEREWOLF_ACTIONS
};
