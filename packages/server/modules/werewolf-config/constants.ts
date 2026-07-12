interface WerewolfModeEntry {
  roleId: string;
  count: number;
}

interface DefaultWerewolfMode {
  id: string;
  name: string;
  description: string;
  roles: WerewolfModeEntry[];
  sheriff: { enabled: boolean; firstDayElection: boolean; voteWeight: number };
  winCondition: string;
  sortOrder: number;
  enabled: boolean;
}

interface WerewolfRoleAction {
  trigger: string;
  action: string;
  targetRule?: string;
  group?: string;
  limit?: string | number;
  condition?: string;
  disabledDeathReasons?: string[];
}

interface DefaultWerewolfRole {
  id: string;
  name: string;
  faction: string;
  roleType: string;
  responsibility: string;
  ability: string;
  keyInfo: string;
  playStyleAdvice: string;
  rule: { actions: WerewolfRoleAction[] };
  sortOrder: number;
}

const sheriff = { enabled: true, firstDayElection: true, voteWeight: 1.5 };

const DEFAULT_WEREWOLF_MODES: DefaultWerewolfMode[] = [
  mode('standard-12', '标准12人局', [
    ['werewolf', 4], ['seer', 1], ['witch', 1], ['hunter', 1], ['idiot', 1], ['villager', 4],
  ], 1),
  mode('guard-12', '预女猎守（12人）', [
    ['werewolf', 4], ['seer', 1], ['witch', 1], ['hunter', 1], ['guard', 1], ['villager', 4],
  ], 2),
  mode('white-wolf-king-guard-12', '白狼王守卫（12人）', [
    ['white_wolf_king', 1], ['werewolf', 3], ['seer', 1], ['witch', 1], ['hunter', 1], ['guard', 1], ['villager', 4],
  ], 3),
  mode('hybrid-12', '混血儿（12人）', [
    ['werewolf', 4], ['seer', 1], ['witch', 1], ['hunter', 1], ['guard', 1], ['hybrid', 1], ['villager', 3],
  ], 4),
  mode('silence-elder-12', '禁言长老（12人）', [
    ['werewolf', 4], ['seer', 1], ['witch', 1], ['hunter', 1], ['silence_elder', 1], ['villager', 4],
  ], 5),
  mode('knight-12', '骑士（12人）', [
    ['werewolf', 4], ['seer', 1], ['witch', 1], ['hunter', 1], ['knight', 1], ['villager', 4],
  ], 6),
  mode('stalker-12', '潜行者（12人）', [
    ['werewolf', 4], ['seer', 1], ['witch', 1], ['hunter', 1], ['stalker', 1], ['villager', 4],
  ], 7),
  mode('butterfly-12', '蝴蝶（12人）', [
    ['werewolf', 4], ['seer', 1], ['witch', 1], ['hunter', 1], ['butterfly', 1], ['villager', 4],
  ], 8),
  mode('wolf-beauty-rogue-12', '狼美人&老流氓（12人）', [
    ['wolf_beauty', 1], ['werewolf', 3], ['seer', 1], ['witch', 1], ['hunter', 1], ['old_rogue', 1], ['villager', 4],
  ], 9),
  mode('evil-knight-12', '恶灵骑士（12人）', [
    ['evil_knight', 1], ['werewolf', 3], ['seer', 1], ['witch', 1], ['hunter', 1], ['idiot', 1], ['villager', 4],
  ], 10),
  mode('evil-knight-guard-12', '恶灵骑士&守卫（12人）', [
    ['evil_knight', 1], ['werewolf', 3], ['seer', 1], ['witch', 1], ['hunter', 1], ['guard', 1], ['villager', 4],
  ], 10),
  mode('nightmare-12', '梦魇（12人）', [
    ['nightmare', 1], ['werewolf', 3], ['seer', 1], ['witch', 1], ['hunter', 1], ['guard', 1], ['villager', 4],
  ], 11),
  mode('dreamer-12', '摄梦人（12人）', [
    ['werewolf', 4], ['seer', 1], ['witch', 1], ['hunter', 1], ['dreamer', 1], ['villager', 4],
  ], 12),
  mode('magician-12', '魔术师（12人）', [
    ['werewolf', 4], ['seer', 1], ['witch', 1], ['hunter', 1], ['magician', 1], ['villager', 4],
  ], 13),
  mode('big-bad-wolf-fortune-teller-12', '大灰狼&占卜师（12人）', [
    ['big_bad_wolf', 1], ['werewolf', 3], ['fortune_teller', 1], ['witch', 1], ['hunter', 1], ['guard', 1], ['villager', 4],
  ], 14),
  mode('hidden-wolf-crow-12', '隐狼&乌鸦（12人）', [
    ['hidden_wolf', 1], ['werewolf', 3], ['seer', 1], ['witch', 1], ['hunter', 1], ['crow', 1], ['villager', 4],
  ], 15),
  mode('bear-tamer-hidden-wolf-12', '驯熊师&隐狼（12人）', [
    ['hidden_wolf', 1], ['werewolf', 3], ['bear_tamer', 1], ['witch', 1], ['hunter', 1], ['idiot', 1], ['villager', 4],
  ], 16),
  mode('wild-child-12', '野孩子（12人）', [
    ['werewolf', 4], ['seer', 1], ['witch', 1], ['hunter', 1], ['wild_child', 1], ['villager', 4],
  ], 18),
  mode('bombman-12', '炸弹人（12人）', [
    ['werewolf', 4], ['seer', 1], ['witch', 1], ['hunter', 1], ['bombman', 1], ['villager', 4],
  ], 19),
  mode('nine-tailed-fox-12', '九尾狐（12人）', [
    ['werewolf', 4], ['seer', 1], ['witch', 1], ['hunter', 1], ['nine_tailed_fox', 1], ['villager', 4],
  ], 20),
  mode('animal-zoo-12', '动物园（12人）', [
    ['wolf_king', 1], ['werewolf', 3], ['bear_tamer', 1], ['penguin', 1], ['crow', 1], ['fox', 1], ['rabbit', 4],
  ], 21),
  mode('black-merchant-big-tree-12', '黑商&大树（12人）', [
    ['white_wolf_king', 1], ['werewolf', 3], ['seer', 1], ['witch', 1], ['hunter', 1], ['black_merchant', 1], ['big_tree', 1], ['villager', 3],
  ], 22),
  mode('black-merchant-wolf-brothers-12', '黑商&狼兄弟（12人）', [
    ['wolf_elder_brother', 1], ['wolf_younger_brother', 1], ['werewolf', 2], ['seer', 1], ['witch', 1], ['black_merchant', 1], ['idiot', 1], ['villager', 4],
  ], 23),
  mode('wolf-seed-hidden-wolf-12', '种狼&隐狼（12人）', [
    ['wolf_seed', 1], ['hidden_wolf', 1], ['werewolf', 2], ['seer', 1], ['witch', 1], ['hunter', 1], ['guard', 1], ['villager', 4],
  ], 24),
  mode('heavenly-eye-requester-12', '天眼&祈求者（12人）', [
    ['demon', 1], ['werewolf', 3], ['heavenly_eye', 1], ['witch', 1], ['hunter', 1], ['requester', 1], ['villager', 4],
  ], 25),
  mode('cupid-thief-12', '丘比特&盗贼（12人）', [
    ['thief', 1], ['wolf_king', 1], ['werewolf', 2], ['seer', 1], ['witch', 1], ['hunter', 1], ['idiot', 1], ['cupid', 1], ['villager', 3],
  ], 26),
  mode('succubus-thief-12', '魅魔特&盗贼（12人）', [
    ['thief', 1], ['succubus', 1], ['werewolf', 3], ['seer', 1], ['witch', 1], ['hunter', 1], ['guard', 1], ['villager', 3],
  ], 27),
  mode('ghost-bride-thief-12', '鬼魂新娘&盗贼（12人）', [
    ['thief', 1], ['ghost_bride', 1], ['werewolf', 3], ['seer', 1], ['witch', 1], ['hunter', 1], ['guard', 1], ['villager', 3],
  ], 28),
  mode('firepower-12', '火力全开（12人）', [
    ['white_wolf_king', 1], ['demon', 1], ['wolf_beauty', 1], ['hidden_wolf', 1], ['fox', 1], ['witch', 1], ['hunter', 1], ['guard', 1], ['idiot', 1], ['big_tree', 1], ['sapling', 2],
  ], 29),
  mode('wolf-escape-10', '狼狼大逃杀（10人）', [
    ['escape_hunter', 3], ['seer', 1], ['witch', 1], ['thick_wolf', 1], ['tamed_werewolf', 2], ['villager', 2],
  ], 29, 'wolf_escape'),
  mode('magic-wolf-demon-hunter-12', '猎魔人&魔狼（12人）', [
    ['magic_wolf', 1], ['werewolf', 3], ['seer', 1], ['witch', 1], ['demon_hunter', 1], ['idiot', 1], ['villager', 4],
  ], 30),
  mode('spirit-wolf-12', '灵狼（12人）', [
    ['spirit_wolf', 1], ['werewolf', 3], ['seer', 1], ['witch', 1], ['hunter', 1], ['guard', 1], ['villager', 4],
  ], 31),
  mode('illusionist-wolf-witch-12', '幻术师&狼巫（12人）', [
    ['wolf_witch', 1], ['werewolf', 3], ['seer', 1], ['witch', 1], ['hunter', 1], ['illusionist', 1], ['villager', 4],
  ], 32),
];

const DEFAULT_WEREWOLF_ROLES: DefaultWerewolfRole[] = [
  role('werewolf', '狼人', 'wolves', 'wolf', [{ trigger: 'night', action: 'kill', targetRule: 'non-wolf', group: 'wolves' }], 1),
  role('white_wolf_king', '白狼王', 'wolves', 'wolf', [{ trigger: 'night', action: 'kill', targetRule: 'non-wolf', group: 'wolves' }, { trigger: 'day', action: 'selfDestruct', targetRule: 'alive-not-self' }], 2),
  role('wolf_king', '狼王', 'wolves', 'wolf', [{ trigger: 'night', action: 'kill', targetRule: 'non-wolf', group: 'wolves' }, { trigger: 'death', action: 'shootOnDeath', disabledDeathReasons: ['witch_poison', 'dreamer_repeat', 'dreamer_link', '女巫毒杀'] }], 3),
  role('seer', '预言家', 'good', 'god', [{ trigger: 'night', action: 'inspectFaction', targetRule: 'alive-not-self' }], 4),
  role('witch', '女巫', 'good', 'god', [{ trigger: 'night', action: 'save', limit: 'once' }, { trigger: 'night', action: 'poison', limit: 'once' }], 5),
  role('hunter', '猎人', 'good', 'god', [{ trigger: 'death', action: 'shootOnDeath', disabledDeathReasons: ['女巫毒药'] }], 6),
  role('guard', '守卫', 'good', 'god', [{ trigger: 'night', action: 'guard', targetRule: 'alive', limit: 'not-same-last-night' }], 7),
  role('idiot', '白痴', 'good', 'god', [{ trigger: 'exile', action: 'surviveExileOnce' }], 8),
  role('hybrid', '混血儿', 'good', 'villager', [{ trigger: 'first-night', action: 'chooseMaster', targetRule: 'alive-not-self' }], 9),
  role('silence_elder', '禁言长老', 'good', 'god', [{ trigger: 'night', action: 'silence', targetRule: 'alive', limit: 'not-same-last-night' }], 10),
  role('knight', '骑士', 'good', 'god', [{ trigger: 'day', action: 'duel', targetRule: 'alive-not-self', limit: 'once' }], 11),
  role('stalker', '潜行者', 'good', 'god', [{ trigger: 'night', action: 'stalk', targetRule: 'previous-vote-not-exiled', limit: 'once' }], 12),
  role('butterfly', '蝴蝶', 'good', 'god', [{ trigger: 'night', action: 'hug', targetRule: 'alive-not-self', limit: 2 }], 13),
  role('wolf_beauty', '狼美人', 'wolves', 'wolf', [{ trigger: 'night', action: 'kill', targetRule: 'non-wolf', group: 'wolves' }, { trigger: 'night', action: 'charm', targetRule: 'alive-not-self' }], 14),
  role('evil_knight', '恶灵骑士', 'wolves', 'wolf', [{ trigger: 'night', action: 'kill', targetRule: 'non-wolf', group: 'wolves' }], 15),
  role('demon', '恶魔', 'wolves', 'wolf', [{ trigger: 'night', action: 'kill', targetRule: 'non-wolf', group: 'wolves' }, { trigger: 'night', action: 'inspectRoleType', targetRule: 'alive-non-wolf' }], 16),
  role('old_rogue', '老流氓', 'good', 'villager', [{ trigger: 'day', action: 'speakOnly' }, { trigger: 'vote', action: 'voteOnly' }], 16),
  role('nightmare', '梦魇', 'wolves', 'wolf', [{ trigger: 'night', action: 'kill', targetRule: 'non-wolf', group: 'wolves' }, { trigger: 'night', action: 'fear', targetRule: 'alive-not-repeat' }], 17),
  role('dreamer', '摄梦人', 'good', 'god', [{ trigger: 'night', action: 'dream', targetRule: 'alive-not-self' }], 18),
  role('magician', '魔术师', 'good', 'god', [{ trigger: 'night', action: 'swap', targetRule: 'two-alive' }], 19),
  role('big_bad_wolf', '大灰狼', 'wolves', 'wolf', [{ trigger: 'night', action: 'soloKill', targetRule: 'non-wolf' }], 20),
  role('fortune_teller', '占卜师', 'good', 'god', [{ trigger: 'night', action: 'mark', targetRule: 'alive-not-self', limit: 'once' }], 21),
  role('hidden_wolf', '隐狼', 'wolves', 'wolf', [{ trigger: 'night', action: 'soloKill', targetRule: 'non-wolf', condition: 'normal-wolves-dead' }], 22),
  role('crow', '乌鸦', 'good', 'god', [{ trigger: 'night', action: 'curse', targetRule: 'alive-not-self-non-repeat' }], 23),
  role('bear_tamer', '驯熊师', 'good', 'god', [{ trigger: 'day', action: 'bearRoar' }], 24),
  role('penguin', '企鹅', 'good', 'god', [{ trigger: 'night', action: 'freeze', targetRule: 'alive-not-self-non-repeat' }], 25),
  role('fox', '狐狸', 'good', 'god', [{ trigger: 'night', action: 'foxInspect', targetRule: 'three-connected' }], 26),
  role('black_merchant', '黑商', 'good', 'god', [{ trigger: 'night', action: 'blackMerchantGift', targetRule: 'alive-not-self', limit: 'once' }], 27),
  role('big_tree', '大树', 'good', 'villager', [{ trigger: 'passive', action: 'treeSurviveWolfHit' }], 28),
  role('wolf_elder_brother', '狼兄', 'wolves', 'wolf', [{ trigger: 'night', action: 'kill', targetRule: 'non-wolf', group: 'wolves' }], 29),
  role('wolf_younger_brother', '狼弟', 'wolves', 'wolf', [{ trigger: 'night', action: 'kill', targetRule: 'non-wolf', group: 'wolves' }, { trigger: 'night', action: 'youngerBrotherKill', targetRule: 'non-wolf', condition: 'night-after-elder-death' }], 30),
  role('wild_child', '野孩子', 'good', 'villager', [{ trigger: 'first-night', action: 'chooseMaster', targetRule: 'alive-not-self' }], 31),
  role('bombman', '炸弹人', 'good', 'god', [{ trigger: 'exile', action: 'blastVoters' }], 32),
  role('nine_tailed_fox', '九尾狐', 'good', 'god', [{ trigger: 'passive', action: 'loseTailOnGoodDeath' }], 33),
  role('wolf_seed', '种狼', 'wolves', 'wolf', [{ trigger: 'night', action: 'kill', targetRule: 'non-wolf', group: 'wolves' }, { trigger: 'night', action: 'infect', targetRule: 'wolf-target', limit: 'once' }], 34),
  role('heavenly_eye', '天眼', 'good', 'god', [{ trigger: 'night', action: 'inspectRole', targetRule: 'alive-not-self' }], 35),
  role('requester', '祈求者', 'good', 'god', [{ trigger: 'first-night', action: 'request', targetRule: 'alive-not-self' }], 36),
  role('thief', '盗贼', 'good', 'villager', [{ trigger: 'first-night', action: 'stealRole', targetRule: 'offered-role' }], 37),
  role('cupid', '丘比特', 'good', 'god', [{ trigger: 'first-night', action: 'linkLovers', targetRule: 'two-alive' }], 38),
  role('succubus', '魅魔', 'wolves', 'wolf', [{ trigger: 'night', action: 'kill', targetRule: 'non-wolf', group: 'wolves' }, { trigger: 'first-night', action: 'succubusLink', targetRule: 'alive-good' }], 39),
  role('ghost_bride', '鬼魂新娘', 'good', 'god', [{ trigger: 'first-night', action: 'ghostBrideLink', targetRule: 'two-alive' }, { trigger: 'night', action: 'ghostBrideChat', targetRule: 'none' }, { trigger: 'night', action: 'ghostBrideKill', targetRule: 'non-third-party' }], 40),
  role('sapling', '树苗', 'good', 'villager', [{ trigger: 'day', action: 'speakOnly' }, { trigger: 'vote', action: 'voteOnly' }], 41),
  role('magic_wolf', '魔狼', 'wolves', 'wolf', [{ trigger: 'night', action: 'kill', targetRule: 'non-wolf', group: 'wolves' }, { trigger: 'day', action: 'selfDestruct' }], 42),
  role('demon_hunter', '猎魔人', 'good', 'god', [{ trigger: 'night', action: 'demonHunterHunt', targetRule: 'alive-not-self', condition: 'from-night-2' }], 43),
  role('spirit_wolf', '灵狼', 'wolves', 'wolf', [
    { trigger: 'night', action: 'kill', targetRule: 'non-wolf', group: 'wolves' },
    { trigger: 'first-night', action: 'spiritWolfLearn', targetRule: 'alive-good' },
    { trigger: 'night', action: 'spiritWolfInspect', targetRule: 'alive-good', condition: 'learned-seer-from-night-2' },
    { trigger: 'night', action: 'spiritWolfGuard', targetRule: 'alive-not-repeat', condition: 'learned-guard-from-night-2' },
    { trigger: 'night', action: 'spiritWolfAntidote', targetRule: 'witch-poison-target', condition: 'learned-witch-after-poison' },
  ], 44),
  role('wolf_witch', '狼巫', 'wolves', 'wolf', [
    { trigger: 'night', action: 'kill', targetRule: 'non-wolf', group: 'wolves' },
    { trigger: 'night', action: 'wolfWitchCurse', targetRule: 'alive-good', limit: 'cooldown-next-night' },
  ], 45),
  role('illusionist', '幻术师', 'good', 'god', [{ trigger: 'night', action: 'illusion', targetRule: 'alive-not-self', limit: 'cooldown-next-night' }], 46),
  role('escape_hunter', '猎人', 'hunters', 'hunter', [
    { trigger: 'night', action: 'hunterHunt', targetRule: 'alive-non-hunter', group: 'escape_hunters' },
    { trigger: 'death', action: 'shootOnDeath', disabledDeathReasons: ['witch_poison', '女巫毒杀'] },
  ], 47),
  role('tamed_werewolf', '狼人', 'good', 'villager', [{ trigger: 'day', action: 'speakOnly' }, { trigger: 'vote', action: 'voteOnly' }], 48),
  role('thick_wolf', '厚皮狼', 'good', 'villager', [{ trigger: 'day', action: 'speakOnly' }, { trigger: 'vote', action: 'voteOnly' }], 49),
  role('villager', '村民', 'good', 'villager', [{ trigger: 'day', action: 'speakOnly' }, { trigger: 'vote', action: 'voteOnly' }], 90),
  role('rabbit', '兔子', 'good', 'villager', [{ trigger: 'day', action: 'speakOnly' }, { trigger: 'vote', action: 'voteOnly' }], 91),
];

function mode(
  id: string,
  name: string,
  roleEntries: Array<[string, number]>,
  sortOrder: number,
  winCondition: string = 'side',
): DefaultWerewolfMode {
  return {
    id,
    name,
    description: name,
    roles: roleEntries.map(([roleId, count]) => ({ roleId, count })),
    sheriff,
    winCondition,
    sortOrder,
    enabled: true,
  };
}

function role(
  id: string,
  name: string,
  faction: string,
  roleType: string,
  actions: WerewolfRoleAction[],
  sortOrder: number,
): DefaultWerewolfRole {
  return {
    id,
    name,
    faction,
    roleType,
    responsibility: name,
    ability: name,
    keyInfo: name,
    playStyleAdvice: name,
    rule: { actions },
    sortOrder,
  };
}

export { DEFAULT_WEREWOLF_MODES, DEFAULT_WEREWOLF_ROLES };
export type { DefaultWerewolfMode, DefaultWerewolfRole, WerewolfModeEntry, WerewolfRoleAction };
