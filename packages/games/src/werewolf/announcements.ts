import { formatAnnouncement, type AnnouncementDefinition } from '@battle/engine';
import { nightCalls, type NightRole } from './nightCalls';
import { nightInstructions } from './nightCallWording';
import { roleName } from './roles';
import type { WerewolfContext } from './rules/context';

type Wording = Pick<WerewolfContext, 'announcementOverrides'>;
const seat = { 座号: '6' };
const seats = { 座位名单: '3号、6号' };

function entry(group: string, title: string, defaultText: string, examples: AnnouncementDefinition['examples'] = {},
  audience: AnnouncementDefinition['audience'] = 'public') {
  return { group, title, defaultText, examples, audience };
}

const lines = {
  nightFalls: entry('昼夜', '天黑闭眼', '天黑请闭眼。'),
  wake: entry('昼夜', '天亮睁眼', '天亮请睁眼。'),
  peaceful: entry('昼夜', '平安夜', '昨晚是平安夜。'),
  nightDeaths: entry('昼夜', '昨夜出局名单', '昨晚{座位名单}出局。', seats),
  witchSave: entry('女巫用药', '询问是否使用解药', '今晚被狼人袭击的是{座号}号。要使用解药吗？', seat, 'private'),
  witchPoison: entry('女巫用药', '询问是否使用毒药', '今晚要使用毒药吗？', {}, 'private'),
  sheriffSignup: entry('警长竞选', '上警报名', '上警的玩家请举手。'),
  sheriffVote: entry('警长竞选', '警长投票', '请警下玩家投票选警长。'),
  sheriffPk: entry('警长竞选', '平票发言', '{座位名单}平票，请依次发言。', seats),
  sheriffRevote: entry('警长竞选', '平票重投', '请有投票权的玩家重新投票。'),
  sheriffElected: entry('警长竞选', '当选警长', '{座号}号当选警长。', seat),
  sheriffNone: entry('警长竞选', '无人当选', '本局无警长。'),
  speechStart: entry('白天流程', '开始发言', '请{座号}号先发言。', seat),
  sheriffSpeechStart: entry('白天流程', '警长指定发言起点', '警长指定{座号}号先发言。', seat),
  exileVote: entry('白天流程', '放逐投票', '请投放逐票。'),
  exile: entry('白天流程', '放逐出局与遗言', '{座号}号玩家被放逐，请发表遗言。', seat),
  exileNone: entry('白天流程', '无人被放逐', '本轮无人出局。'),
  exileTie: entry('白天流程', '放逐平票', '平票，本轮无人出局。'),
  exileAbstained: entry('白天流程', '全员弃票', '全员弃票，本轮无人出局。'),
  exileBonusOnly: entry('白天流程', '额外票放逐', '因额外票，{座号}号玩家被放逐，请发表遗言。', seat),
  idiotRevealed: entry('白天流程', '白痴翻牌', '{座号}号是白痴，翻牌免死，失去投票权。', seat),
  lastWords: entry('白天流程', '发表遗言', '{座号}号，请发表遗言。', seat),
  selfDestruct: entry('白天流程', '自爆后取消投票', '{座号}号自爆，直接进入黑夜。', seat),
  winner: entry('赛后', '胜负与身份公布', '游戏结束，{胜负结果}。现在公布所有身份。', { 胜负结果: '好人阵营胜利' }),
  mvp: entry('赛后', '公布 MVP', '本局 MVP：{座号}号。', seat),
  brideFirst: entry('夜间叫号', '新郎与证婚人首夜交流', '新郎、证婚人请睁眼，与新娘交流。'),
  brideLater: entry('夜间叫号', '新娘、新郎与证婚人交流', '新娘、新郎、证婚人请睁眼，开始夜聊。'),
  spiritLater: entry('夜间叫号', '灵狼后续夜晚行动', '灵狼请睁眼行动。'),
  requesterLater: entry('夜间叫号', '祈求者后续夜晚行动', '祈求者请睁眼行动。'),
};

export function line(ctx: Wording, key: keyof typeof lines, values: Readonly<Record<string, string | number>> = {}) {
  return formatAnnouncement(ctx.announcementOverrides?.[key] ?? lines[key].defaultText, values);
}

/** 天亮口令、竞选提示和死讯可分别编辑。相邻句缺少标点时补句号供法官停顿。 */
export function joinNotices(...parts: string[]): string {
  return parts.filter(Boolean).reduce((text, next) =>
    text && !/[。！？!?；;，,：:、…．.\s]$/.test(text) ? text + '。' + next : text + next, '');
}

function roleDefinition(role: NightRole): AnnouncementDefinition {
  const name = roleName(role);
  const defaultText = `${name}请睁眼${nightInstructions[role]}`;
  return { key: 'wake.' + role, ...entry('夜间叫号', `${name}睁眼`, defaultText) };
}

export function roleCall(ctx: Wording, role: NightRole): string {
  const definition = roleDefinition(role);
  return ctx.announcementOverrides?.[definition.key] ?? definition.defaultText;
}

export const werewolfAnnouncements: readonly AnnouncementDefinition[] = [
  ...Object.entries(lines).map(([key, value]) => ({ key, ...value })),
  ...Array.from(new Set<NightRole>(['werewolf', ...nightCalls.values()]), roleDefinition),
];

export const nightFallsDefault = lines.nightFalls.defaultText;
