import { defineBoard as board, type BoardDefinition } from './boardDefinition';

// 第四批板子（板子规则表 28–32；29 狼狼大逃亡规则表中没有规则，未实现）。

export const FINAL_BOARDS: readonly BoardDefinition[] = [
  board({
    key: 'firepower-12',
    name: '火力全开',
    description: '白狼王、恶魔、狼美人、隐狼对抗狐狸、女巫、猎人、守卫、白痴、大树与 2 棵树苗；隐狼与狼队一起击杀，白狼王出局前查验为好人；树苗全部出局时大树随之倒下。',
    roles: {
      white_wolf_king: 1,
      demon: 1,
      wolf_beauty: 1,
      hidden_wolf_pack: 1,
      fox: 1,
      witch: 1,
      hunter: 1,
      guard: 1,
      idiot: 1,
      big_tree: 1,
      sapling: 2,
    },
    config: { categories: { idiot: 'villager' } },
    notes: ['本板子的白痴算作民牌：屠边时计入村民（村民一边是白痴、大树与树苗）。'],
  }),
  board({
    key: 'magic-wolf-demon-hunter-12',
    name: '猎魔人&魔狼',
    description: '魔狼与 3 名狼人对抗预言家、女巫、猎魔人、白痴与 4 名村民；魔狼自爆后当晚封印所有神职，猎魔人从第二夜起每晚可以狩猎一名玩家。',
    roles: { magic_wolf: 1, werewolf: 3, seer: 1, witch: 1, demon_hunter: 1, idiot: 1, villager: 'rest' },
  }),
  board({
    key: 'spirit-wolf-12',
    name: '灵狼',
    description: '灵狼与 3 名狼人对抗预言家、女巫、猎人、守卫与 4 名村民；灵狼首夜学习一名好人的技能，在女巫之后、预言家之前行动。',
    roles: { spirit_wolf: 1, werewolf: 3, seer: 1, witch: 1, hunter: 1, guard: 1, villager: 'rest' },
  }),
];
