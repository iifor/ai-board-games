import { splitPlayableDisplaySegments } from '../../../utils/playableText';
import { buildSpeechSubtitleTimeline, findActiveCue } from '../../../utils/wordBoundariesToSubtitle';
import type { SpeechState } from '../../../types';

export type WerewolfInteractionStatus = 'idle' | 'acting' | 'submitted' | 'resolved' | 'skipped';
export type WerewolfInteractionTemplate = 'idle' | 'speech' | 'single-target' | 'dual-target' | 'binary-choice' | 'multi-choice' | 'passive-trigger' | 'result-reveal';
export type WerewolfInteractionVisualKind = 'wolf' | 'seer' | 'witch' | 'guard' | 'hunter' | 'self-destruct' | 'knight' | 'idiot' | 'sheriff' | 'generic' | 'none';

export interface WerewolfInteractionState {
  action: string;
  title: string;
  detail: string;
  status: WerewolfInteractionStatus;
  template: WerewolfInteractionTemplate;
  tone: 'day' | 'wolf' | 'seer' | 'witch' | 'guard' | 'system';
  actorIds: number[];
  targetIds: number[];
  resultLabel: string;
}

type EventLike = Record<string, unknown> & {
  type?: string;
  workflowEvent?: string;
  actionType?: string;
  message?: string;
  actionWindow?: { actorIds?: Array<string | number>; targetIds?: Array<string | number> };
};

const ACTION_META: Record<string, Pick<WerewolfInteractionState, 'title' | 'template' | 'tone'>> = {
  wolf_vote: { title: '狼人选择袭击目标', template: 'single-target', tone: 'wolf' },
  wolf_kill: { title: '狼人确认刀口', template: 'single-target', tone: 'wolf' },
  wolf_speech: { title: '狼队夜间商议', template: 'speech', tone: 'wolf' },
  seer_check: { title: '预言家查验', template: 'single-target', tone: 'seer' },
  guard_protect: { title: '守卫守护', template: 'single-target', tone: 'guard' },
  witch_save: { title: '女巫使用解药', template: 'binary-choice', tone: 'witch' },
  witch_poison: { title: '女巫使用毒药', template: 'single-target', tone: 'witch' },
  magician_swap: { title: '魔术师交换', template: 'dual-target', tone: 'system' },
  day_speech: { title: '白天发言', template: 'speech', tone: 'day' },
  day_vote: { title: '放逐投票', template: 'single-target', tone: 'day' },
  sheriff_signup: { title: '是否上警', template: 'binary-choice', tone: 'day' },
  sheriff_vote: { title: '警长投票', template: 'single-target', tone: 'day' },
  sheriff_speech: { title: '警上发言', template: 'speech', tone: 'day' },
  hunter_shot: { title: '猎人开枪', template: 'passive-trigger', tone: 'day' },
  self_destruct: { title: '狼人自爆', template: 'passive-trigger', tone: 'wolf' },
  knight_duel: { title: '骑士决斗', template: 'passive-trigger', tone: 'day' },
  idiot_reveal: { title: '白痴翻牌', template: 'passive-trigger', tone: 'day' },
  silence_result: { title: '禁言生效', template: 'passive-trigger', tone: 'day' },
  hybrid_master: { title: '混血儿选择榜样', template: 'single-target', tone: 'system' },
  butterfly_hug: { title: '花蝴蝶拥抱', template: 'single-target', tone: 'system' },
  stalker_assassinate: { title: '潜行者暗杀', template: 'single-target', tone: 'system' },
  wolf_beauty_charm: { title: '狼美人魅惑', template: 'single-target', tone: 'wolf' },
  demon_inspect: { title: '恶魔查验', template: 'result-reveal', tone: 'wolf' },
  nightmare_fear: { title: '噩梦之影恐惧', template: 'single-target', tone: 'wolf' },
  dreamer_dream: { title: '摄梦人入梦', template: 'single-target', tone: 'guard' },
  fortune_teller_mark: { title: '占卜师标记', template: 'single-target', tone: 'seer' },
  big_bad_wolf_kill: { title: '大灰狼袭击', template: 'single-target', tone: 'wolf' },
  crow_curse: { title: '乌鸦诅咒', template: 'single-target', tone: 'system' },
  bear_tamer_roar: { title: '驯熊师咆哮', template: 'result-reveal', tone: 'day' },
  penguin_freeze: { title: '企鹅冰冻', template: 'single-target', tone: 'system' },
  fox_inspect: { title: '狐狸查验', template: 'result-reveal', tone: 'seer' },
  black_merchant_gift: { title: '黑商赠礼', template: 'single-target', tone: 'system' },
  wolf_seed_infect: { title: '狼种感染', template: 'single-target', tone: 'wolf' },
  heavenly_eye_check: { title: '天眼查验', template: 'result-reveal', tone: 'seer' },
  requester_pray: { title: '求道者祈愿', template: 'binary-choice', tone: 'system' },
  requester_kill: { title: '求道者处决', template: 'single-target', tone: 'system' },
  thief_choose: { title: '盗贼选择身份', template: 'binary-choice', tone: 'system' },
  cupid_link: { title: '丘比特连结', template: 'dual-target', tone: 'system' },
  succubus_link: { title: '魅魔连结', template: 'single-target', tone: 'system' },
  ghost_bride_link: { title: '鬼新娘结缘', template: 'dual-target', tone: 'system' },
  ghost_bride_chat: { title: '鬼新娘私语', template: 'speech', tone: 'system' },
  ghost_bride_kill: { title: '鬼新娘索命', template: 'single-target', tone: 'system' },
  escape_hunter_speech: { title: '逃亡猎人商议', template: 'speech', tone: 'system' },
  escape_hunter_vote: { title: '逃亡猎人投票', template: 'single-target', tone: 'system' },
  escape_hunter_hunt: { title: '逃亡猎人狩猎', template: 'single-target', tone: 'system' },
  demon_hunter_hunt: { title: '猎魔人狩猎', template: 'single-target', tone: 'system' },
  spirit_wolf_learn: { title: '灵狼学习技能', template: 'multi-choice', tone: 'wolf' },
  spirit_wolf_inspect: { title: '灵狼查验', template: 'result-reveal', tone: 'wolf' },
  spirit_wolf_guard: { title: '灵狼守护', template: 'single-target', tone: 'wolf' },
  spirit_wolf_antidote: { title: '灵狼解毒', template: 'single-target', tone: 'wolf' },
  wolf_witch_curse: { title: '狼巫诅咒', template: 'single-target', tone: 'wolf' },
  illusionist_illusion: { title: '幻术师制造幻象', template: 'single-target', tone: 'system' },
};

const RESOLVED_EVENTS = new Set([
  'wolf_vote', 'seer_check', 'guard_action', 'witch_action', 'hunter_shot', 'self_destruct',
  'knight_duel', 'wolf_beauty_charm', 'butterfly_hug', 'stalker_assassinate', 'nightmare_fear',
  'dreamer_dream', 'magician_swap', 'demon_inspect', 'fortune_teller_mark', 'big_bad_wolf_kill',
  'crow_curse', 'bear_tamer_roar', 'penguin_freeze', 'fox_inspect', 'black_merchant_gift',
  'wolf_seed_infect', 'heavenly_eye_check', 'requester_kill', 'ghost_bride_link', 'ghost_bride_kill',
  'escape_hunter_hunt', 'demon_hunter_hunt', 'spirit_wolf_inspect', 'spirit_wolf_guard',
  'spirit_wolf_antidote', 'wolf_witch_curse', 'illusionist_illusion',
]);

const ACTION_VISUALS: Partial<Record<string, WerewolfInteractionVisualKind>> = {
  wolf_vote: 'wolf',
  wolf_kill: 'wolf',
  wolf_speech: 'wolf',
  seer_check: 'seer',
  witch_save: 'witch',
  witch_poison: 'witch',
  guard_protect: 'guard',
  hunter_shot: 'hunter',
  self_destruct: 'self-destruct',
  selfdestruct: 'self-destruct',
  knight_duel: 'knight',
  idiot_reveal: 'idiot',
};

export function resolveWerewolfInteraction(event: EventLike | null | undefined): WerewolfInteractionState {
  if (!event) return idleState();
  const workflowEvent = normalize(String(event.workflowEvent || event.type || ''));
  const action = normalize(String(event.actionType || workflowEvent));
  const status = resolveStatus(workflowEvent, event);
  const resolvedAction = resolveAction(action, workflowEvent);
  const meta = ACTION_META[resolvedAction] || { title: event.message || '等待下一阶段', template: 'idle' as const, tone: 'system' as const };
  const actorIds = ids(event.actionWindow?.actorIds);
  const targetIds = resolveTargets(event);
  const resolved = status === 'resolved' && ['seer_check', 'day_vote', 'sheriff_vote'].includes(resolvedAction);

  return {
    action: resolvedAction,
    title: String(meta.title),
    detail: String(event.message || getWerewolfInteractionStatusText(status)),
    status,
    template: resolved ? 'result-reveal' : meta.template,
    tone: meta.tone,
    actorIds: actorIds.length ? actorIds : resolveActors(event),
    targetIds,
    resultLabel: resolveResultLabel(event, resolvedAction, status),
  };
}

export function shouldProjectWerewolfInteraction(event: EventLike | null | undefined): boolean {
  const interaction = resolveWerewolfInteraction(event);
  return interaction.status !== 'skipped' && Boolean(ACTION_META[interaction.action]);
}

export function getWerewolfInteractionVisualKind(action: string): WerewolfInteractionVisualKind {
  const normalized = normalize(action);
  if (!normalized) return 'none';
  if (normalized.startsWith('sheriff_')) return 'sheriff';
  return ACTION_VISUALS[normalized] || 'generic';
}

export function resolveNightAwakeLabel(action: string): string {
  if (!action) return '天黑请闭眼';
  if (action.startsWith('wolf_')) return '狼队睁眼';
  if (action === 'seer_check') return '预言家睁眼';
  if (action.startsWith('witch_')) return '女巫睁眼';
  if (action === 'guard_protect') return '守卫睁眼';
  if (ACTION_META[action] && ACTION_META[action].tone !== 'day') return '夜间角色睁眼';
  return '天黑请闭眼';
}

export function getWerewolfInteractionStatusText(status: WerewolfInteractionStatus): string {
  return { idle: '等待行动', acting: '正在选择', submitted: '正在行动', resolved: '结果已公布', skipped: '本次行动已跳过' }[status];
}

export function getWerewolfInteractionAnimationKey(interaction: WerewolfInteractionState): string {
  return interaction.action;
}

export function shouldShowWerewolfStageDetails(interaction: Pick<WerewolfInteractionState, 'template'>): boolean {
  return interaction.template !== 'speech';
}

export function resolveWerewolfSpeechSpeaker<T extends { id: unknown }>(
  speech: { playerId?: unknown } | null | undefined,
  players: T[],
): T | null {
  if (speech?.playerId === null || speech?.playerId === undefined) return null;
  return players.find((player) => Number(player.id) === Number(speech.playerId)) || null;
}

export function resolveWerewolfActiveSubtitle(
  speech: Pick<SpeechState, 'text' | 'fullText' | 'wordBoundaries' | 'currentTimeMs'> | null | undefined,
  fallback: string = '',
): string {
  const text = String(speech?.text || speech?.fullText || fallback).trim();
  if (!text) return '';
  const timeline = buildSpeechSubtitleTimeline(text, speech?.wordBoundaries);
  if (timeline.cues.length && speech?.currentTimeMs != null) {
    return findActiveCue(timeline.cues, speech.currentTimeMs)?.text || '';
  }
  return splitPlayableDisplaySegments(text, { maxChars: 42 })[0] || text;
}

function idleState(): WerewolfInteractionState {
  return { action: '', title: '等待下一阶段', detail: '游戏尚未开始', status: 'idle', template: 'idle', tone: 'system', actorIds: [], targetIds: [], resultLabel: '' };
}

function resolveResultLabel(event: EventLike, action: string, status: WerewolfInteractionStatus): string {
  if (status !== 'resolved') return '';
  const seer = event.seerCheck as { result?: unknown } | undefined;
  const witch = event.witchAction as { use?: unknown } | undefined;
  const duel = event.knightDuel as { success?: unknown } | undefined;
  if (action === 'seer_check' && seer?.result) return `查验结果：${String(seer.result)}`;
  if (action === 'guard_protect') return '守护生效';
  if (action.startsWith('witch_')) {
    if (witch?.use === false) return '保留药剂';
    return action === 'witch_save' ? '解药已使用' : '毒药已使用';
  }
  if (action === 'hunter_shot') return '开枪发动';
  if (action === 'self_destruct' || action === 'selfdestruct') return '自爆发动';
  if (action === 'knight_duel' && typeof duel?.success === 'boolean') return duel.success ? '决斗成功' : '决斗失败';
  if (action === 'idiot_reveal') return '身份已公开';
  if (action.startsWith('sheriff_') && event.sheriffId != null) return '警长当选';
  if ((action === 'wolf_vote' || action === 'wolf_kill') && event.wolfTarget != null) return '刀口锁定';
  return '';
}

function resolveStatus(workflowEvent: string, event: EventLike): WerewolfInteractionStatus {
  if (workflowEvent.includes('skipped')) return 'skipped';
  if (workflowEvent.includes('submitted')) return 'submitted';
  if (workflowEvent.includes('result') || RESOLVED_EVENTS.has(workflowEvent)) return 'resolved';
  if (event.actionWindow || event.actionType || event.speech) return 'acting';
  return 'idle';
}

function resolveAction(action: string, workflowEvent: string): string {
  if (workflowEvent.startsWith('sheriff_') || workflowEvent.startsWith('sheriff-')) {
    if (workflowEvent.includes('signup') || workflowEvent.includes('start')) return 'sheriff_signup';
    if (workflowEvent.includes('speech')) return 'sheriff_speech';
    if (workflowEvent.includes('vote')) return 'sheriff_vote';
  }
  if (workflowEvent === 'speech' || workflowEvent.includes('last_words') || workflowEvent.includes('exile_words')) return 'day_speech';
  if (workflowEvent.includes('vote_result') || workflowEvent === 'vote-result') return 'day_vote';
  return action;
}

function resolveActors(event: EventLike): number[] {
  const shot = event.shot as { from?: unknown } | undefined;
  const speech = event.speech as { playerId?: unknown } | undefined;
  const duel = event.knightDuel as { actorId?: unknown } | undefined;
  return ids([shot?.from, speech?.playerId, duel?.actorId, event.playerId, event.actorId]);
}

function resolveTargets(event: EventLike): number[] {
  const seer = event.seerCheck as { target?: unknown } | undefined;
  const guard = event.guardAction as { target?: unknown } | undefined;
  const witch = event.witchAction as { target?: unknown } | undefined;
  const shot = event.shot as { target?: unknown } | undefined;
  const exile = event.exile as { id?: unknown } | undefined;
  const swap = event.magicianSwap as { firstTarget?: unknown; secondTarget?: unknown } | undefined;
  const duel = event.knightDuel as { targetId?: unknown } | undefined;
  const fortune = event.fortuneTellerMark as { target?: unknown } | undefined;
  const crow = event.crowCurse as { target?: unknown } | undefined;
  const demon = event.demonInspect as { target?: unknown } | undefined;
  const targets = ids([
    event.targetId, event.wolfTarget, event.wolfBeautyTarget, event.butterflyTarget, event.stalkerTarget,
    event.nightmareTarget, event.dreamerTarget, event.bigBadWolfTarget, event.penguinFrozenId,
    event.youngerBrotherTarget, event.demonHunterTarget, event.illusionTarget,
    shot?.target, seer?.target, guard?.target, witch?.target, exile?.id, duel?.targetId,
    fortune?.target, crow?.target, demon?.target, swap?.firstTarget, swap?.secondTarget,
  ]);
  return targets;
}

function ids(values: unknown): number[] {
  return [...new Set((Array.isArray(values) ? values : []).map(Number).filter((value) => Number.isFinite(value) && value > 0))];
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replaceAll('-', '_');
}
