import { defineBoard as board, type BoardDefinition } from './boardDefinition';

// 第三批板子（板子规则表 20–27）。

export const EXTENDED_BOARDS: readonly BoardDefinition[] = [
  board({
    key: 'black-merchant-big-tree-12',
    name: '黑商&大树',
    description: '白狼王与 3 名狼人对抗预言家、女巫、猎人、黑商、大树与 3 名村民；黑商首夜把一项技能交给一名玩家，大树要被刀两次才会出局。',
    roles: { white_wolf_king: 1, werewolf: 3, seer: 1, witch: 1, hunter: 1, black_merchant: 1, big_tree: 1, villager: 'rest' },
    config: { blackMerchant: 'first_night' },
  }),
  board({
    key: 'black-merchant-wolf-brothers-12',
    name: '黑商&狼兄弟',
    description: '狼兄、狼弟与 2 名狼人对抗预言家、女巫、黑商、白痴与 4 名村民；狼兄出局后狼弟先单独击杀一次，再加入狼队。',
    roles: { wolf_elder_brother: 1, wolf_younger_brother: 1, werewolf: 2, seer: 1, witch: 1, black_merchant: 1, idiot: 1, villager: 'rest' },
    config: { blackMerchant: 'any_night' },
  }),
  board({
    key: 'animal-zoo-12',
    name: '动物园',
    description: '狼王与 3 名狼人对抗熊、企鹅、乌鸦、狐狸与兔兔（11 人局 3 只兔兔，12 人局 4 只）；乌鸦的诅咒额外加 2 票。',
    roles: { wolf_king: 1, werewolf: 3, bear: 1, penguin: 1, crow: 1, fox: 1, rabbit: 'rest' },
    players: { min: 11, max: 12 },
    config: { crowVotes: 2 },
  }),
  board({
    key: 'wolf-seed-hidden-wolf-12',
    name: '种狼',
    description: '种狼、隐狼与 2 名狼人对抗预言家、女巫、猎人、守卫与 4 名村民；种狼全场可以把一名被害者感染为狼人，隐狼与狼人互不相认。',
    roles: { wolf_seed: 1, hidden_wolf: 1, werewolf: 2, seer: 1, witch: 1, hunter: 1, guard: 1, villager: 'rest' },
    config: { hiddenWolf: 'linked' },
  }),
  board({
    key: 'heavenly-eye-requester-12',
    name: '天眼&祈求者',
    description: '恶魔与 3 名狼人对抗天眼、女巫、猎人、祈求者与 4 名村民；天眼验出具体身份，祈求者首夜按祈求对象获得能力，祈求到狼人则成为第三方。',
    roles: { demon: 1, werewolf: 3, heavenly_eye: 1, witch: 1, hunter: 1, requester: 1, villager: 'rest' },
  }),
  board({
    key: 'cupid-thief-12',
    name: '丘比特&盗贼',
    description: '14 张身份牌（开局抽出两张底牌）：盗贼、狼王、2 名狼人、预言家、女巫、猎人、白痴、丘比特与 5 名平民；丘比特首夜连出情侣，人狼恋时与情侣组成第三方。',
    roles: { thief: 1, wolf_king: 1, werewolf: 2, seer: 1, witch: 1, hunter: 1, idiot: 1, cupid: 1, villager: 3 },
    extraCards: { villager: 2 },
  }),
  board({
    key: 'succubus-thief-12',
    name: '魅魔&盗贼',
    description: '14 张身份牌（开局抽出两张底牌）：盗贼、魅魔、3 名狼人、预言家、女巫、猎人、守卫与 5 名平民；魅魔混在狼队中，首夜与一名好人结为第三方情侣。',
    roles: { thief: 1, succubus: 1, werewolf: 3, seer: 1, witch: 1, hunter: 1, guard: 1, villager: 3 },
    extraCards: { villager: 2 },
  }),
  board({
    key: 'ghost-bride-thief-12',
    name: '鬼魂新娘&盗贼',
    description: '14 张身份牌（开局抽出两张底牌）：盗贼、鬼魂新娘、3 名狼人、预言家、女巫、猎人、守卫与 5 名平民；鬼魂新娘与新郎、证婚人组成第三方。',
    roles: { thief: 1, ghost_bride: 1, werewolf: 3, seer: 1, witch: 1, hunter: 1, guard: 1, villager: 3 },
    extraCards: { villager: 2 },
  }),
];
