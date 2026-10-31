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
];
