import type { MatchTraceDto } from '@battle/shared';
import { phaseLabel, traceLabel } from '../labels';

type Dict = Record<string, unknown>;
type Fact = [string, string];
export function object(value: unknown): Dict {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Dict : {};
}
const text = (value: unknown) => typeof value === 'string' ? value : undefined;
const seatLabel = (value: unknown) => typeof value === 'number' ? `${value} 号` : undefined;
function labelOf(labels: Readonly<Record<string, string>> | undefined, key: string) {
  return labels && Object.hasOwn(labels, key) ? labels[key] ?? key : key;
}

const teams: Record<string, string> = {
  good: '好人阵营', werewolf: '狼人阵营', lone_wolf: '狼人阵营（离群）', ghost_bride: '鬼魂新娘阵营',
  pro: '正方', con: '反方', judge: '评委',
};
const fields: Record<string, string> = {
  seed: '随机种子', specVersion: '规则版本', specHash: '规则指纹', variantKey: '板子标识',
  action: '动作', command: '调试指令', configuredNext: '下一阶段', trigger: '触发来源',
  template: '任务模板', previousError: '上次错误', previousRequestId: '上次请求', reason: '原因',
  error: '错误', applied: '采纳的行动', result: '结算结果', target: '目标', targets: '目标座位',
  speech: '发言', comment: '点评', verdict: '判定', channel: '频道', kind: '类型', round: '轮次',
  text: '内容', seat: '座位', title: '标题', phaseId: '阶段', seq: '事件序号', params: '玩法参数',
};
const actionLabels: Record<string, string> = { announce: '播报', compute: '结算', reveal: '揭示', debug: '调试' };
const nightLabels: Record<string, string> = {
  wolfTarget: '狼刀目标', saved: '解药救人', poisoned: '毒药目标', guarded: '守护目标',
  silenced: '禁言目标', hugged: '花蝴蝶拥抱', feared: '梦魇恐惧', stalked: '潜行者暗杀', charmed: '狼美人魅惑',
  dreamed: '摄梦对象', dreamRepeat: '连续摄梦', swapped: '魔术师交换座位', marked: '占卜师标记', cursed: '乌鸦诅咒',
  bigBadWolfArmed: '大灰狼发动单独击杀', bigBadWolfTarget: '大灰狼击杀目标', frozen: '企鹅冰冻',
  giftPoisoned: '赠药毒杀目标', merchantSkill: '黑商赠予技能', merchantBackfire: '黑商交易反噬', infecting: '种狼发动感染',
  brotherTarget: '狼弟击杀目标', thirdKill: '第三方击杀目标', hunted: '猎魔人狩猎', spiritShield: '灵狼庇护',
  spiritAntidote: '灵狼解毒', hexed: '狼巫诅咒', phantom: '幻术师幻象',
};

export function fieldValue(value: unknown): string {
  if (value === undefined) return '未记录';
  if (value === null) return '无';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (Array.isArray(value)) return value.length ? value.map(fieldValue).join('、') : '无';
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    return entries.length ? entries.map(([key, v]) => `${labelOf(fields, key)}：${fieldValue(v)}`).join('\n') : '无';
  }
  return String(value);
}

export function dataFacts(data: Dict, exclude: readonly string[] = []): Fact[] {
  return Object.entries(data).filter(([key]) => !exclude.includes(key)).map(([key, v]) => {
    let value = fieldValue(v);
    if (typeof v === 'string') {
      if (key === 'action' || key === 'command' || key === 'kind') value = actionLabels[v] ?? traceLabel(v);
      if (key === 'configuredNext' || key === 'phaseId') value = phaseLabel(v);
    }
    return [labelOf(fields, key), value];
  });
}

export function readSnapshot(value: unknown, match: MatchTraceDto['match']) {
  const data = object(value);
  if (!Array.isArray(data.seats) && !Object.keys(object(data.state)).length) return null;
  const state = object(data.state), board = object(state.board), topic = object(state.topic);
  const roster = new Map(match.seats.map(s => [s.seat, s.name]));
  const seats = (Array.isArray(data.seats) ? data.seats : []).flatMap(entry => {
    const s = object(entry);
    if (typeof s.seat !== 'number') return [];
    const role = text(s.role);
    const team = text(s.team);
    return [{ seat: s.seat, name: text(object(s.profile).name) ?? roster.get(s.seat) ?? '未记录',
      role: role ? labelOf(match.roleNames, role) : '未记录', team: team ? labelOf(teams, team) : '未记录',
      alive: typeof s.alive === 'boolean' ? s.alive : null }];
  }).sort((a, b) => a.seat - b.seat);
  const status: Fact[] = [];
  const night: Fact[] = [];
  if (match.gameKey === 'werewolf') {
    const potions = object(state.potions);
    if ('sheriff' in state) status.push(['警长', state.sheriff === null ? '暂无警长' : seatLabel(state.sheriff) ?? '未记录']);
    const hasWitch = !Array.isArray(data.seats) || data.seats.some(entry => object(entry).role === 'witch');
    if (hasWitch && Object.keys(potions).length) {
      for (const [key, label] of [['antidote', '女巫解药'], ['poison', '女巫毒药']] as const) {
        status.push([label, typeof potions[key] === 'boolean' ? (potions[key] ? '可用' : '已用完') : '未记录']);
      }
    }
    if (Array.isArray(state.lastNightDeaths) && state.lastNightDeaths.length) {
      status.push(['最近公布的夜间出局', state.lastNightDeaths.map(seatLabel).join('、')]);
    }
    for (const [key, v] of Object.entries(object(state.night))) {
      if (v === null || v === false || (Array.isArray(v) && !v.length)) continue;
      night.push([labelOf(nightLabels, key), (Object.hasOwn(nightLabels, key) && typeof v === 'number') ? `${v} 号` : fieldValue(v)]);
    }
  }
  return { boardName: text(board.name), rules: text(board.rules), seats, status, night,
    hasNight: match.gameKey === 'werewolf' && Object.keys(object(state.night)).length > 0,
    topic: text(topic.title), pro: text(topic.pro), con: text(topic.con) };
}
