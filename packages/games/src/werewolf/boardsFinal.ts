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
];
