import { Crown, Moon, Shield, Sparkles, Sun, Swords, Users, Vote, Wand2 } from 'lucide-react';
import type { Player, GameEvent, WerewolfRound, WerewolfNight, WerewolfMode, WerewolfModeRole, NightBadge, NightBadgeTheme, RoleConfigGroup, EventLogEntry, RoundProgressItem, HostOption, SheriffElection } from '../../types';
import { ROLE_NAMES, ROLE_ICON, EVENT_LABELS, WEREWOLF_NIGHT_BADGE_THEME } from './constants';

export { ROLE_NAMES };

interface NormalizedRole {
  id: string;
  name: string;
  count: number;
  faction?: string;
}

interface RoleDetail {
  id: string;
  name: string;
  count: number;
}

interface NightBadgeOptions {
  prefix?: string;
  result?: string;
  theme?: NightBadgeTheme;
  titlePrefix?: string;
  titleSuffix?: string;
}

export function buildEventLogEntry(event: GameEvent): EventLogEntry | null {
  if (event.type === 'sheriff-withdraw') return null;
  const gameRounds = Array.isArray(event.game?.rounds) ? event.game!.rounds! : [];
  const round = event.round || gameRounds[gameRounds.length - 1];
  const day = round?.day ? `? ${round.day} ?` : '';
  const title = [day, EVENT_LABELS[event.type] || event.type].filter(Boolean).join(' · ');
  const text = getWerewolfFlowLabel(event) || getWerewolfDisplayText(event) || event.narration || getEventSummary(event) || getWerewolfNarration(event);
  if (!text) return null;
  return {
    id: `${Date.now()}-${event.type}-${Math.random().toString(16).slice(2)}`,
    kind: event.type,
    title,
    text,
    icon: getEventIcon(event.type)
  };
}

function getEventSummary(event: GameEvent): string {
  if (event.type === 'night-result') return formatNightSummary(event.round || null, event.game?.players || [], true);
  if (event.type === 'vote-result') return getVoteSummary(event.round || null, event.game?.players || []);
  if (event.type === 'hunter-shot' && event.shot) {
    const players = event.game?.players || [];
    return `${formatWerewolfSeatLabel(event.shot.from, players)}猎人开枪，带走 ${formatWerewolfSeatLabel(event.shot.target, players)}。`;
  }
  if (event.type === 'self-destruct') {
    const players = event.game?.players || [];
    const actorId = event.speech?.playerId || event.selfDestruct?.playerId || event.playerId || '';
    const targetId = event.selfDestruct?.targetId || event.targetId;
    const targetText = targetId ? `，带走 ${formatWerewolfSeatLabel(targetId, players)}` : '';
    return `${formatWerewolfSeatLabel(actorId, players)}白狼王自爆${targetText}，白天流程中止。`;
  }
  if (event.type === 'escape-hunter-vote' && event.escapeHunterTarget) {
    return `猎人共同选择猎杀${formatWerewolfSeatLabel(event.escapeHunterTarget, event.game?.players || [])}。`;
  }
  if (event.type === 'thick-wolf-armor' && event.targetId) {
    return `${formatWerewolfSeatLabel(event.targetId, event.game?.players || [])}抵挡了本次猎杀，护甲已破裂。`;
  }
  if (event.type === 'silence-result') {
    const players = event.game?.players || [];
    return event.silencedPlayerId
      ? `${formatWerewolfSeatLabel(event.silencedPlayerId, players)}被禁言，本日跳过发言。`
      : '禁言长老本夜未禁言。';
  }
  if (event.type === 'knight-duel' && event.knightDuel) {
    const players = event.game?.players || [];
    const knight = formatWerewolfSeatLabel(event.knightDuel.actorId || '', players);
    const target = formatWerewolfSeatLabel(event.knightDuel.targetId || '', players);
    return event.knightDuel.success
      ? `${knight}决斗${target}成功，目标死亡，本日跳过放逐投票。`
      : `${knight}决斗${target}失败，骑士死亡，白天继续放逐。`;
  }
  if (event.type === 'butterfly-hug') {
    const players = event.game?.players || [];
    return event.butterflyTarget ? `花蝴蝶抱住了${formatWerewolfSeatLabel(event.butterflyTarget, players)}。` : '花蝴蝶本夜未抱人。';
  }
  if (event.type === 'stalker-assassinate') {
    const players = event.game?.players || [];
    return event.stalkerTarget ? `潜行者暗杀了${formatWerewolfSeatLabel(event.stalkerTarget, players)}。` : '潜行者本夜未暗杀。';
  }
  if (event.type === 'wolf-beauty-charm') {
    const players = event.game?.players || [];
    return event.wolfBeautyTarget ? `Wolf beauty charmed ${formatWerewolfSeatLabel(event.wolfBeautyTarget, players)}.` : 'Wolf beauty did not charm anyone.';
  }
  if (event.type === 'demon-inspect') {
    const players = event.game?.players || [];
    const target = event.demonInspect?.target;
    return target ? `Demon inspected ${formatWerewolfSeatLabel(target, players)}.` : 'Demon did not inspect anyone.';
  }
  if (event.type === 'nightmare-fear') {
    const players = event.game?.players || [];
    return event.nightmareTarget ? `Nightmare feared ${formatWerewolfSeatLabel(event.nightmareTarget, players)}.` : 'Nightmare did not fear anyone.';
  }
  if (event.type === 'dreamer-dream') {
    const players = event.game?.players || [];
    return event.dreamerTarget ? `摄梦人摄梦 ${formatWerewolfSeatLabel(event.dreamerTarget, players)}。` : '摄梦人本夜未摄梦。';
  }
  if (event.type === 'magician-swap') {
    const players = event.game?.players || [];
    const swap = event.magicianSwap as { firstTarget?: string | number | null; secondTarget?: string | number | null } | null | undefined;
    return swap?.firstTarget && swap?.secondTarget
      ? `魔术师交换了${formatWerewolfSeatLabel(swap.firstTarget, players)}和${formatWerewolfSeatLabel(swap.secondTarget, players)}。`
      : '魔术师本夜未交换。';
  }
  if (event.type === 'fortune-teller-mark') {
    const players = event.game?.players || [];
    return event.fortuneTellerMark?.target
      ? `占卜师标记了${formatWerewolfSeatLabel(event.fortuneTellerMark.target, players)}。`
      : '占卜师本夜未标记。';
  }
  if (event.type === 'big-bad-wolf-kill') {
    const players = event.game?.players || [];
    return event.bigBadWolfTarget
      ? `大灰狼额外袭击了${formatWerewolfSeatLabel(event.bigBadWolfTarget, players)}。`
      : '大灰狼本夜未额外袭击。';
  }
  if (event.type === 'demon-hunter-hunt') {
    const players = event.game?.players || [];
    const target = event.demonHunterTarget as string | number | null | undefined;
    return target
      ? `猎魔人狩猎了${formatWerewolfSeatLabel(target, players)}。`
      : '猎魔人本夜未狩猎。';
  }
  if (event.type === 'spirit-wolf-learn') {
    const players = event.game?.players || [];
    const target = event.spiritWolfLearn?.targetId as string | number | null | undefined;
    return target ? `灵狼学习了${formatWerewolfSeatLabel(target, players)}。` : '灵狼本夜未学习。';
  }
  if (event.type === 'spirit-wolf-inspect') {
    const players = event.game?.players || [];
    const inspect = event.spiritWolfInspect as { target?: string | number | null; result?: string } | null | undefined;
    return inspect?.target ? `灵狼查验了${formatWerewolfSeatLabel(inspect.target, players)}：${inspect.result || '未知'}。` : '灵狼本夜未查验。';
  }
  if (event.type === 'spirit-wolf-guard') {
    const players = event.game?.players || [];
    const target = event.spiritWolfGuardTarget as string | number | null | undefined;
    return target ? `灵狼庇护了${formatWerewolfSeatLabel(target, players)}。` : '灵狼本夜未庇护。';
  }
  if (event.type === 'spirit-wolf-antidote') {
    const players = event.game?.players || [];
    const target = event.spiritWolfAntidoteTarget as string | number | null | undefined;
    return target ? `灵狼解救了${formatWerewolfSeatLabel(target, players)}。` : '灵狼本夜未使用解药。';
  }
  if (event.type === 'wolf-witch-curse') {
    const players = event.game?.players || [];
    const curse = event.wolfWitchCurse as { targetId?: string | number | null } | null | undefined;
    return curse?.targetId ? `狼巫诅咒了${formatWerewolfSeatLabel(curse.targetId, players)}。` : '狼巫本夜未诅咒。';
  }
  if (event.type === 'illusionist-illusion') {
    const players = event.game?.players || [];
    const target = event.illusionTarget as string | number | null | undefined;
    return target ? `幻术师选择${formatWerewolfSeatLabel(target, players)}成为幻象。` : '幻术师本夜未制造幻象。';
  }
  if (event.type === 'crow-curse') {
    const players = event.game?.players || [];
    return event.crowCurse?.target
      ? `乌鸦诅咒了${formatWerewolfSeatLabel(event.crowCurse.target, players)}，白天放逐票数增加。`
      : '乌鸦本夜未诅咒。';
  }
  if (event.type === 'black-merchant-gift') {
    const players = event.game?.players || [];
    return event.blackMerchantGift?.targetId
      ? `黑商赠技给${formatWerewolfSeatLabel(event.blackMerchantGift.targetId, players)}，${event.blackMerchantGift.success ? '赠送成功' : '赠送失败'}。`
      : '黑商本夜未赠技。';
  }
  if (event.type === 'lucky-seer-check') {
    const players = event.game?.players || [];
    return event.luckySeerCheck?.target
      ? `幸运儿查验了${formatWerewolfSeatLabel(event.luckySeerCheck.target, players)}：${event.luckySeerCheck.result || '未知'}。`
      : '幸运儿本夜未查验。';
  }
  if (event.type === 'lucky-witch-poison') {
    const players = event.game?.players || [];
    return event.luckyPoisonTarget ? `幸运儿毒了${formatWerewolfSeatLabel(event.luckyPoisonTarget, players)}。` : '幸运儿本夜未用毒。';
  }
  if (event.type === 'younger-brother-kill') {
    const players = event.game?.players || [];
    return event.youngerBrotherTarget ? `狼弟独刀了${formatWerewolfSeatLabel(event.youngerBrotherTarget, players)}。` : '狼弟本夜未独刀。';
  }
  if (event.type === 'penguin-freeze') {
    const players = event.game?.players || [];
    return event.penguinFrozenId ? `企鹅冰冻了${formatWerewolfSeatLabel(event.penguinFrozenId, players)}。` : '企鹅本夜未冰冻。';
  }
  if (event.type === 'fox-inspect') {
    return event.foxInspect?.targetIds?.length
      ? `狐狸验三连结果：${event.foxInspect.hasWolf ? '有狼' : '无狼'}。`
      : '狐狸本夜未查验。';
  }
  if (event.type === 'bear-tamer-roar') {
    const wolfCount = event.bearRoar?.adjacentWolfIds?.length || 0;
    return event.bearRoar?.roaring
      ? `驯熊师咆哮，身边发现 ${wolfCount} 名狼人。`
      : '驯熊师未咆哮，身边暂未发现狼人。';
  }
  if (event.type === 'sheriff-result') {
    const players = event.game?.players || [];
    return event.message || (event.round?.sheriffId ? `${formatWerewolfSeatLabel(event.round.sheriffId, players)}当选警长。` : '本局无人当选警长。');
  }
  if (event.type === 'game') return event.game?.winReason || '';
  return '';
}

function getEventIcon(type: string): React.ReactElement {
  if (type === 'night-result' || type === 'phase-start' || type.endsWith('-wake') || type.startsWith('witch-')) return <Moon size={18} />;
  if (type === 'day-start') return <Sun size={18} />;
  if (type === 'vote-result' || type === 'sheriff-vote' || type === 'sheriff-runoff-vote') return <Vote size={18} />;
  if (type === 'hunter-shot' || type === 'self-destruct') return <Swords size={18} />;
  if (type === 'knight-duel') return <Shield size={18} />;
  if (type.startsWith('sheriff-') || type === 'speech-order') return <Crown size={18} />;
  if (type === 'game') return <Shield size={18} />;
  if (type === 'players') return <Users size={18} />;
  return <Wand2 size={18} />;
}

export function getRoleConfigGroups(players: Player[], mode: WerewolfMode | null | undefined, showRoles: boolean): RoleConfigGroup[] {
  const sourceRoles: NormalizedRole[] = players.length ? players.map((player) => ({
    id: player.role || 'unknown',
    name: getVisibleRoleText(player, showRoles, player.id),
    count: 1,
    faction: player.faction
  })) : normalizeModeRoles(mode);

  const groups: Record<string, RoleConfigGroup> = {
    wolves: { id: 'wolves', name: '狼人阵营', count: 0, icon: ROLE_ICON.werewolf, details: [] },
    gods: { id: 'gods', name: '神职阵营', count: 0, icon: <Sparkles size={18} />, details: [] },
    villagers: { id: 'villagers', name: '平民阵营', count: 0, icon: ROLE_ICON.villager, details: [] }
  };
  const details: Record<string, Map<string, RoleDetail>> = { wolves: new Map(), gods: new Map() };

  sourceRoles.forEach((role) => {
    const faction = resolveRoleFaction(role);
    groups[faction].count += role.count;
    if (faction === 'wolves' && !isBaseWerewolfRole(role)) addRoleDetail(details.wolves, role);
    if (faction === 'gods') addRoleDetail(details.gods, role);
  });

  groups.wolves.details = [...details.wolves.values()];
  groups.gods.details = [...details.gods.values()];
  return [groups.wolves, groups.gods, groups.villagers];
}

function normalizeModeRoles(mode: WerewolfMode | null | undefined): NormalizedRole[] {
  if (!Array.isArray(mode?.roles)) return [];
  return mode!.roles!.map((item: WerewolfModeRole) => ({
    id: item.roleId || item.id || item.name || 'unknown',
    name: item.roleName || item.name || ROLE_NAMES[item.roleId || ''] || item.roleId || '未知身份',
    count: Number(item.count || 1),
    faction: item.faction
  }));
}

function resolveRoleFaction(role: NormalizedRole): string {
  const id = String(role.id || '').toLowerCase();
  const name = String(role.name || '');
  const faction = String(role.faction || '').toLowerCase();
  if (faction === 'wolves' || faction === 'wolf' || id.includes('wolf') || name.includes('?')) return 'wolves';
  if (id === 'evil_knight') return 'wolves';
  if (id === 'wild_child') return 'villagers';
  if (id === 'hybrid' || id === 'old_rogue' || id === 'villager' || id === 'rabbit' || id === 'civilian' || name.includes('村民') || name.includes('平民') || name.includes('兔子') || name.includes('混血儿') || name.includes('老流氓')) return 'villagers';
  return 'gods';
}

function isBaseWerewolfRole(role: NormalizedRole): boolean {
  const id = String(role.id || '').toLowerCase();
  const name = String(role.name || '');
  return id === 'werewolf' || id === 'wolf' || name === '狼人';
}

function addRoleDetail(map: Map<string, RoleDetail>, role: NormalizedRole): void {
  const id = role.id || role.name;
  const current = map.get(id) || { id, name: role.name || ROLE_NAMES[role.id] || '未知身份', count: 0 };
  current.count += role.count;
  map.set(id, current);
}

export function buildRoundProgress(rounds: WerewolfRound[], currentRound: WerewolfRound | null): RoundProgressItem[] {
  const items: RoundProgressItem[] = [];
  rounds.forEach((round) => {
    const day = Number(round.day || 1);
    items.push({
      key: `night-${day}`,
      phase: 'night',
      label: `第${day}天：夜晚`,
      active: Number(currentRound?.day) === day && currentRound?.phase === 'night'
    });
    const hasDay = round.phase === 'day'
      || round.exile
      || round.idiotReveal
      || round.sheriffId
      || Object.keys(round.voteTally || {}).length
      || (round.speeches || []).length;
    if (hasDay) {
      items.push({
        key: `day-${day}`,
        phase: 'day',
        label: `第${day}天：白天`,
        active: Number(currentRound?.day) === day && currentRound?.phase === 'day'
      });
    }
  });
  return items.slice(-8);
}

export function getGameStats(players: Player[]): { alive: number; dead: number } {
  const alive = players.filter((player) => player.alive).length;
  return { alive, dead: Math.max(0, players.length - alive) };
}

export function formatWerewolfModeSummary(mode: WerewolfMode): string {
  const roles = Array.isArray(mode.roles) ? mode.roles : [];
  const lineup = roles.map((item: WerewolfModeRole) => `${item.roleName || item.name || ROLE_NAMES[item.roleId || ''] || item.roleId}x${item.count}`).join('、');
  const sheriff = mode.sheriff?.enabled ? '警徽流' : '无警徽';
  const winMap: Record<string, string> = { side: '屠边局', gods: '屠神局', villagers: '屠民局', all: '屠城局' };
  return [lineup, sheriff, winMap[mode.winCondition || ''] || mode.winCondition].filter(Boolean).join(' · ');
}

export function getWerewolfModePlayerCount(mode: WerewolfMode | null | undefined): number {
  const roles = Array.isArray(mode?.roles) ? mode!.roles! : [];
  const count = roles.reduce((sum: number, item: WerewolfModeRole) => sum + (Number(item.count) || 0), 0);
  return count || 12;
}

export function getWerewolfHostOptions(players: Player[] = []): HostOption[] {
  return [
    { id: 'default', badge: '主', name: '默认主持人', description: '使用全局主持人模型与语音' },
    ...sortPlayersById(players).map((player) => ({
      id: Number(player.id),
      badge: player.id,
      name: player.nickname || player.name || `${player.id}号`,
      description: [player.model, player.voicePackageId ? `语音包 ${player.voicePackageId}` : '未绑定语音'].filter(Boolean).join(' · ')
    }))
  ];
}

export function normalizeWerewolfHostId(value: string | number | null | undefined): number | 'default' {
  const id = Number(value);
  return id > 0 ? id : 'default';
}

export function sortPlayersById(players: Player[] = []): Player[] {
  return players.slice().sort((a, b) => Number(a.id) - Number(b.id));
}

export function getWerewolfSeatNumber(playerId: string | number, players: Player[] = []): number | string {
  const index = sortPlayersById(players).findIndex((player) => Number(player.id) === Number(playerId));
  if (index >= 0) return index + 1;
  // 找不到时，如果 ID 看起来像座位号（1-20），直接使用；否则返回空
  const num = Number(playerId);
  return (num > 0 && num <= 20) ? num : '';
}

export function formatWerewolfSeatLabel(playerId: string | number, players: Player[] = []): string {
  const seatNumber = getWerewolfSeatNumber(playerId, players);
  return seatNumber ? `${seatNumber}号玩家` : '玩家';
}

export function normalizeWerewolfSelectedIds(ids: (number | string)[] = [], players: Player[] = [], mode?: WerewolfMode | null): number[] {
  const playerIds = new Set(sortPlayersById(players).map((player) => Number(player.id)).filter(Boolean));
  const required = getWerewolfModePlayerCount(mode);
  const selected = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((id) => playerIds.has(id)))].sort((a, b) => a - b);
  if (selected.length === required) return selected;
  if (selected.length > required) return selected.slice(0, required);
  const missing = sortPlayersById(players)
    .map((player) => Number(player.id))
    .filter((id) => id && !selected.includes(id))
    .slice(0, Math.max(0, required - selected.length));
  return [...selected, ...missing].sort((a, b) => a - b);
}

export function sanitizeWerewolfSelectedIds(ids: (number | string)[] = [], players: Player[] = []): number[] {
  const playerIds = new Set(sortPlayersById(players).map((player) => Number(player.id)).filter(Boolean));
  const selected = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter(Boolean))]
    .filter((id) => !playerIds.size || playerIds.has(id));
  return selected.sort((a, b) => a - b);
}

export function toggleWerewolfPlayerId(ids: (number | string)[] = [], id?: number | string, mode?: WerewolfMode | null): number[] {
  const target = Number(id);
  if (!target) return ids.map(Number).filter(Boolean);
  const required = getWerewolfModePlayerCount(mode);
  const selected = ids.map(Number).filter(Boolean);
  if (selected.includes(target)) return selected.filter((item) => item !== target).sort((a, b) => a - b);
  if (selected.length >= required) return selected;
  return [...selected, target].sort((a, b) => a - b);
}

export function getPhaseTitle(round: WerewolfRound | null, streamMessage?: string): string {
  if (!round) return streamMessage || '等待开局';
  if (round.phase === 'night') return '夜晚行动';
  if (round.phase === 'day') return '白天发言与投票';
  return streamMessage || '游戏进行中';
}

export function getRoundResult(round: WerewolfRound | null, players: Player[] = []): string {
  if (!round) return '等待主持人发牌';
  const night = round.night?.deaths?.length
    ? `夜晚死亡：${round.night.deaths.map((item: { id: string; reason?: string }) => formatWerewolfSeatLabel(item.id, players)).join('、')}`
    : '夜晚：平安夜';
  const exile = round.exile
    ? `放逐：${formatWerewolfSeatLabel(round.exile.id, players)}`
    : round.idiotReveal ? `白痴翻牌：${formatWerewolfSeatLabel(round.idiotReveal.id, players)}` : '放逐：暂无';
  return `${night} | ${exile}`;
}

export function getWerewolfNarration(event: GameEvent | null | undefined): string {
  if (event?.presentation?.suppressSpeech) return '';
  if (event?.presentation?.speakableText) return event.presentation.speakableText;
  if (event?.type === 'speech' || event?.type === 'wolf-speech' || event?.type === 'self-destruct' || event?.type === 'sheriff-speech' || event?.type === 'sheriff-runoff-speech') return event.speech?.text || '';
  if (event?.type === 'last-words' || event?.type === 'exile-words') return event.testimony?.text || '';
  if (event?.type === 'hunter-shot') return getEventSummary(event);
  return event?.message || event?.narration || '';
}

export function getWerewolfDisplayText(event: GameEvent | null | undefined): string {
  if (event?.audienceCue?.display) {
    return '[系统播报中]';
  }
  return event?.presentation?.displayText || event?.message || '';
}

export function getWerewolfFlowLabel(event: GameEvent | null | undefined): string {
  if (event?.type === 'seer-check') return event.message || '预言家查验结果';
  const labels: Record<string, string> = {
    'wolf-beauty-charm': 'Wolf beauty charm',
    'demon-inspect': 'Demon inspect',
    'nightmare-fear': 'Nightmare fear',
    'dreamer-dream': '摄梦人摄梦',
    'wolf-wake': '狼人行动',
    'wolf-leader': '狼队领袖指定',
    'seer-wake': '预言家查验',
    'guard-wake': '守卫守护',
    'hybrid-master': '混血儿选择',
    'silence-result': '禁言结果',
    'knight-duel': '骑士决斗',
    'butterfly-hug': '花蝴蝶抱人',
    'stalker-assassinate': '潜行者暗杀',
    'fortune-teller-mark': '占卜师标记',
    'big-bad-wolf-kill': '大灰狼袭击',
    'demon-hunter-hunt': '猎魔人狩猎',
    'crow-curse': '乌鸦诅咒',
    'bear-tamer-roar': '驯熊师咆哮',
    'witch-antidote': '女巫解药',
    'witch-poison': '女巫毒药',
    'day-speech': '白天发言',
    'day-vote': '放逐投票',
    'vote-result': '投票结果',
  };
  return labels[event?.type || ''] || '';
}

export function shouldShowWerewolfActionTargets(round: WerewolfRound | null): boolean {
  if (round?.votes && Object.keys(round.votes).length) return true;
  if (round?.voteTally && Object.keys(round.voteTally).length) return true;
  const election = round?.sheriffElection;
  if (election && !election.sheriffId && election.result === 'pending') {
    if (hasSheriffVoteData(election)) return true;
  }
  return false;
}

export function getWerewolfActionTarget(round: WerewolfRound | null, player: Player): string | null {
  if (!round || !player) return null;
  if (round.votes?.[player.id]) return round.votes[player.id];
  const election = round?.sheriffElection;
  if (election) {
    if (election.runoffVotes?.[player.id]) return election.runoffVotes[player.id];
    if (election.votes?.[player.id]) return election.votes[player.id];
  }
  return null;
}

function hasSheriffVoteData(election: SheriffElection): boolean {
  return Boolean(
    (election.votes && Object.keys(election.votes).length) ||
    (election.runoffVotes && Object.keys(election.runoffVotes).length)
  );
}

export function getWerewolfNightActionBadges(round: WerewolfRound | null, player: Player, nightActionType: string = '', players: Player[] = []): NightBadge[] {
  if (!round?.night || !player) return [];
  const night = round.night;
  const badges: NightBadge[] = [];

  if (player.role === 'escape_hunter' && nightActionType === 'escape-hunter-vote' && night.escapeHunterTarget) {
    badges.push(createNightTargetBadge('escape-hunt', String(night.escapeHunterTarget), players, {
      prefix: '猎',
      titlePrefix: '共同猎杀',
      theme: WEREWOLF_NIGHT_BADGE_THEME.danger,
    }));
  }
  if (nightActionType === 'thick-wolf-armor' && Number(night.thickWolfArmorBreak?.targetId) === Number(player.id)) {
    badges.push({
      kind: 'thick-wolf-armor',
      label: '破甲',
      title: '厚皮狼抵挡本次猎杀，护甲已破裂',
      theme: WEREWOLF_NIGHT_BADGE_THEME.safe,
    });
  }

  const wolfVoteTarget = night.wolfChoices?.[player.id];
  if (player.faction === 'wolves' || player.role === 'werewolf') {
    if (wolfVoteTarget && (nightActionType === 'wolf-wake' || nightActionType === 'wolf-leader')) {
      badges.push(createNightTargetBadge('wolf', wolfVoteTarget, players, { titlePrefix: '夜投' }));
    }
    if (night.wolfTarget && nightActionType === 'wolf-vote') {
      badges.push(createNightTargetBadge('wolf', night.wolfTarget, players, { prefix: '刀', titlePrefix: '刀口' }));
    }
  }
  if (player.role === 'seer' && night.seerCheck?.target) {
    if (nightActionType === 'seer-wake' || nightActionType === 'seer-check') {
      const theme = getSeerCheckTheme(night.seerCheck.result);
      badges.push(createNightTargetBadge('seer', night.seerCheck.target, players, {
        result: night.seerCheck.result || '',
        theme,
        titlePrefix: '查验',
        titleSuffix: `：${night.seerCheck.result || '未知'}`
      }));
    }
  }
  if (player.role === 'guard' && night.guardTarget) {
    if (nightActionType === 'guard-wake') {
      badges.push(createNightTargetBadge('guard', night.guardTarget, players, { titlePrefix: '守护' }));
    }
  }
  if (player.role === 'silence_elder' && round.silencedPlayerId) {
    if (nightActionType === 'silence-result') {
      badges.push(createNightTargetBadge('silence', String(round.silencedPlayerId), players, { titlePrefix: '禁言' }));
    }
  }
  if (player.role === 'butterfly' && night.butterflyTarget) {
    if (nightActionType === 'butterfly-hug') {
      badges.push(createNightTargetBadge('butterfly', String(night.butterflyTarget), players, { titlePrefix: '抱人' }));
    }
  }
  if (player.role === 'stalker' && night.stalkerTarget) {
    if (nightActionType === 'stalker-assassinate') {
      badges.push(createNightTargetBadge('stalker', String(night.stalkerTarget), players, { titlePrefix: '暗杀' }));
    }
  }
  if (player.role === 'wolf_beauty' && night.wolfBeautyTarget) {
    if (nightActionType === 'wolf-beauty-charm') {
      badges.push(createNightTargetBadge('wolf-beauty', String(night.wolfBeautyTarget), players, { titlePrefix: 'Charm' }));
    }
  }
  if (player.role === 'demon' && night.demonInspect?.target) {
    if (nightActionType === 'demon-inspect') {
      badges.push(createNightTargetBadge('demon', String(night.demonInspect.target), players, {
        result: night.demonInspect.result || '',
        titlePrefix: 'Inspect',
        titleSuffix: ` (${night.demonInspect.result || 'unknown'})`
      }));
    }
  }
  if (player.role === 'nightmare' && night.nightmareTarget) {
    if (nightActionType === 'nightmare-fear') {
      badges.push(createNightTargetBadge('nightmare', String(night.nightmareTarget), players, { titlePrefix: 'Fear' }));
    }
  }
  if (player.role === 'dreamer' && night.dreamerTarget) {
    if (nightActionType === 'dreamer-dream') {
      badges.push(createNightTargetBadge('dreamer', String(night.dreamerTarget), players, { titlePrefix: '摄梦' }));
    }
  }
  if (player.role === 'magician' && night.magicianSwap?.firstTarget && night.magicianSwap?.secondTarget) {
    if (nightActionType === 'magician-swap') {
      badges.push(createNightTargetBadge('magician', String(night.magicianSwap.firstTarget), players, { titlePrefix: '交换' }));
      badges.push(createNightTargetBadge('magician', String(night.magicianSwap.secondTarget), players, { titlePrefix: '交换' }));
    }
  }
  if (player.role === 'fortune_teller' && night.fortuneTellerMark?.target) {
    if (nightActionType === 'fortune-teller-mark') {
      badges.push(createNightTargetBadge('fortune-teller', String(night.fortuneTellerMark.target), players, { titlePrefix: '标记' }));
    }
  }
  if (player.role === 'big_bad_wolf' && night.bigBadWolfTarget) {
    if (nightActionType === 'big-bad-wolf-kill') {
      badges.push(createNightTargetBadge('big-bad-wolf', String(night.bigBadWolfTarget), players, { titlePrefix: '袭击', theme: WEREWOLF_NIGHT_BADGE_THEME.danger }));
    }
  }
  if (player.role === 'crow' && night.crowCurse?.target) {
    if (nightActionType === 'crow-curse') {
      badges.push(createNightTargetBadge('crow', String(night.crowCurse.target), players, {
        prefix: '+1',
        titlePrefix: '诅咒',
        titleSuffix: '（放逐票 +1）',
        theme: WEREWOLF_NIGHT_BADGE_THEME.danger
      }));
    }
  }
  if (player.role === 'black_merchant' && night.blackMerchantGift?.targetId) {
    if (nightActionType === 'black-merchant-gift') {
      badges.push(createNightTargetBadge('black-merchant', String(night.blackMerchantGift.targetId), players, {
        prefix: night.blackMerchantGift.success ? '赠' : '反',
        titlePrefix: '赠技',
        titleSuffix: night.blackMerchantGift.gift ? `（${night.blackMerchantGift.gift}）` : '',
        theme: night.blackMerchantGift.success ? WEREWOLF_NIGHT_BADGE_THEME.safe : WEREWOLF_NIGHT_BADGE_THEME.danger
      }));
    }
  }
  const isGhostBrideMember = player.role === 'ghost_bride' || player.loverSource === 'ghost_bride' || Boolean(player.witnessForGhostBride);
  if (isGhostBrideMember && nightActionType === 'ghost-bride-chat') {
    badges.push({ kind: 'ghost-bride-chat', label: '夜聊', use: true, title: '鬼魂新娘阵营夜聊', theme: WEREWOLF_NIGHT_BADGE_THEME.safe });
  }
  if (player.role === 'ghost_bride' && night.ghostBrideLink?.partnerId && nightActionType === 'ghost-bride-link') {
    badges.push(createNightTargetBadge('ghost-bride-link', String(night.ghostBrideLink.partnerId), players, { prefix: '牵', titlePrefix: '新郎', theme: WEREWOLF_NIGHT_BADGE_THEME.safe }));
    if (night.ghostBrideLink.witnessId) {
      badges.push(createNightTargetBadge('ghost-bride-witness', String(night.ghostBrideLink.witnessId), players, { prefix: '证', titlePrefix: '见证人', theme: WEREWOLF_NIGHT_BADGE_THEME.safe }));
    }
  }
  if (isGhostBrideMember && night.ghostBrideTarget && nightActionType === 'ghost-bride-kill') {
    badges.push(createNightTargetBadge('ghost-bride-kill', String(night.ghostBrideTarget), players, {
      prefix: '刀',
      titlePrefix: '鬼魂新娘击杀',
      theme: WEREWOLF_NIGHT_BADGE_THEME.danger
    }));
  }
  if (player.blackMerchantGift && !player.blackMerchantGift.used) {
    badges.push({
      kind: 'black-merchant-gifted',
      label: player.blackMerchantGift.action === 'inspectFaction' ? '查' : player.blackMerchantGift.action === 'poison' ? '毒' : '枪',
      use: true,
      title: '黑商赠送技能待使用',
      theme: WEREWOLF_NIGHT_BADGE_THEME.safe
    });
  }
  if (player.role === 'big_tree' && Number(player.bigTreeWolfHits || 0) > 0) {
    badges.push({
      kind: 'big-tree',
      label: `${player.bigTreeWolfHits}/2`,
      use: true,
      title: '大树已承受狼刀',
      theme: WEREWOLF_NIGHT_BADGE_THEME.muted
    });
  }
  if (player.godSkillsDisabled) {
    badges.push({
      kind: 'god-disabled',
      label: '禁',
      use: true,
      title: '神职技能已失效',
      theme: WEREWOLF_NIGHT_BADGE_THEME.danger
    });
  }
  if (player.role === 'wolf_younger_brother' && player.wolfElderBrotherDeathDay) {
    badges.push({
      kind: 'younger-brother-awake',
      label: '醒',
      use: true,
      title: '狼弟已觉醒',
      theme: WEREWOLF_NIGHT_BADGE_THEME.danger
    });
  }
  if (player.role === 'wolf_younger_brother' && night.youngerBrotherTarget && nightActionType === 'younger-brother-kill') {
    badges.push(createNightTargetBadge('younger-brother', String(night.youngerBrotherTarget), players, {
      prefix: '刀',
      titlePrefix: '独刀',
      theme: WEREWOLF_NIGHT_BADGE_THEME.danger
    }));
  }
  if (night.luckySeerCheck?.actorId && Number(night.luckySeerCheck.actorId) === Number(player.id) && nightActionType === 'lucky-seer-check') {
    badges.push(createNightTargetBadge('lucky-check', String(night.luckySeerCheck.target), players, {
      prefix: '验',
      result: night.luckySeerCheck.result,
      titlePrefix: '赠技查验',
      theme: getSeerCheckTheme(night.luckySeerCheck.result)
    }));
  }
  if (night.luckyPoisonTarget && player.blackMerchantGift?.action === 'poison' && nightActionType === 'lucky-witch-poison') {
    badges.push(createNightTargetBadge('lucky-poison', String(night.luckyPoisonTarget), players, {
      prefix: '毒',
      titlePrefix: '赠技毒药',
      theme: WEREWOLF_NIGHT_BADGE_THEME.danger
    }));
  }
  if (player.role === 'penguin' && night.penguinFrozenId) {
    if (nightActionType === 'penguin-freeze') {
      badges.push(createNightTargetBadge('penguin', String(night.penguinFrozenId), players, {
        prefix: '冻',
        titlePrefix: '冰冻',
        theme: WEREWOLF_NIGHT_BADGE_THEME.muted
      }));
    }
  }
  if (player.role === 'fox' && night.foxInspect?.targetIds?.length) {
    if (nightActionType === 'fox-inspect') {
      badges.push({
        kind: 'fox',
        label: '三连',
        result: night.foxInspect.hasWolf ? '有狼' : '无狼',
        use: true,
        title: `狐狸查验：${night.foxInspect.hasWolf ? '三连中有狼' : '三连中无狼'}`,
        theme: night.foxInspect.hasWolf ? WEREWOLF_NIGHT_BADGE_THEME.danger : WEREWOLF_NIGHT_BADGE_THEME.safe
      });
    }
  }
  if (player.role === 'bear_tamer' && nightActionType === 'bear-tamer-roar') {
    const adjacentWolfIds = Array.isArray(round.bearRoar?.adjacentWolfIds) ? round.bearRoar!.adjacentWolfIds! : [];
    badges.push({
      kind: 'bear-tamer',
      label: round.bearRoar?.roaring ? '咆哮' : '安静',
      result: round.bearRoar?.roaring ? `${adjacentWolfIds.length}狼` : '无狼',
      use: round.bearRoar?.roaring === true,
      title: round.bearRoar?.roaring ? `驯熊师身边有 ${adjacentWolfIds.length} 名狼人` : '驯熊师身边未发现狼人',
      theme: round.bearRoar?.roaring ? WEREWOLF_NIGHT_BADGE_THEME.danger : WEREWOLF_NIGHT_BADGE_THEME.safe
    });
  }
  if (player.role === 'demon_hunter' && night.demonHunterTarget && nightActionType === 'demon-hunter-hunt') {
    badges.push(createNightTargetBadge('demon-hunter', String(night.demonHunterTarget), players, {
      prefix: '猎',
      titlePrefix: '狩猎',
      theme: WEREWOLF_NIGHT_BADGE_THEME.danger
    }));
  }
  if (player.role === 'spirit_wolf') {
    if (night.spiritWolfLearn?.targetId && nightActionType === 'spirit-wolf-learn') {
      badges.push(createNightTargetBadge('spirit-wolf-learn', String(night.spiritWolfLearn.targetId), players, { prefix: '学', titlePrefix: '学习', theme: WEREWOLF_NIGHT_BADGE_THEME.safe }));
    }
    if (night.spiritWolfInspect?.target && nightActionType === 'spirit-wolf-inspect') {
      badges.push(createNightTargetBadge('spirit-wolf-inspect', String(night.spiritWolfInspect.target), players, {
        prefix: '验',
        result: night.spiritWolfInspect.result,
        titlePrefix: '查验',
        theme: getSeerCheckTheme(night.spiritWolfInspect.result)
      }));
    }
    if (night.spiritWolfGuardTarget && nightActionType === 'spirit-wolf-guard') {
      badges.push(createNightTargetBadge('spirit-wolf-guard', String(night.spiritWolfGuardTarget), players, { prefix: '护', titlePrefix: '庇护', theme: WEREWOLF_NIGHT_BADGE_THEME.safe }));
    }
    if (night.spiritWolfAntidoteTarget && nightActionType === 'spirit-wolf-antidote') {
      badges.push(createNightTargetBadge('spirit-wolf-antidote', String(night.spiritWolfAntidoteTarget), players, { prefix: '救', titlePrefix: '解救', theme: WEREWOLF_NIGHT_BADGE_THEME.safe }));
    }
  }
  if (player.role === 'wolf_witch' && night.wolfWitchCurse?.targetId && nightActionType === 'wolf-witch-curse') {
    badges.push(createNightTargetBadge('wolf-witch-curse', String(night.wolfWitchCurse.targetId), players, {
      prefix: '咒',
      titlePrefix: '诅咒',
      theme: WEREWOLF_NIGHT_BADGE_THEME.danger
    }));
  }
  if (player.role === 'illusionist' && night.illusionTarget && nightActionType === 'illusionist-illusion') {
    badges.push(createNightTargetBadge('illusionist-illusion', String(night.illusionTarget), players, {
      prefix: '幻',
      titlePrefix: '幻象',
      theme: WEREWOLF_NIGHT_BADGE_THEME.safe
    }));
  }
  if (player.role === 'witch') {
    if (['witch-antidote', 'witch-antidote-action', 'witch-poison', 'witch-poison-action'].includes(nightActionType)) {
      appendWitchNightActionBadges(badges, night, nightActionType, players);
    }
  }
  return badges;
}

export function getNightActionPlayerIds(eventType: string, players: Player[] = []): number[] {
  const roleByNightEvent: Record<string, string> = {
    'escape-hunter-speech': 'escape_hunter',
    'escape-hunter-vote': 'escape_hunter',
    'thick-wolf-armor': 'thick_wolf',
    'wolf-beauty-charm': 'wolf_beauty',
    'demon-inspect': 'demon',
    'nightmare-fear': 'nightmare',
    'dreamer-dream': 'dreamer',
    'magician-swap': 'magician',
    'fortune-teller-mark': 'fortune_teller',
    'big-bad-wolf-kill': 'big_bad_wolf',
    'demon-hunter-hunt': 'demon_hunter',
    'spirit-wolf-learn': 'spirit_wolf',
    'spirit-wolf-inspect': 'spirit_wolf',
    'spirit-wolf-guard': 'spirit_wolf',
    'spirit-wolf-antidote': 'spirit_wolf',
    'wolf-witch-curse': 'wolf_witch',
    'illusionist-illusion': 'illusionist',
    'crow-curse': 'crow',
    'black-merchant-gift': 'black_merchant',
    'ghost-bride-link': 'ghost_bride',
    'ghost-bride-chat': 'ghost_bride',
    'ghost-bride-kill': 'ghost_bride',
    'younger-brother-kill': 'wolf_younger_brother',
    'penguin-freeze': 'penguin',
    'fox-inspect': 'fox',
    'bear-tamer-roar': 'bear_tamer',
    'hybrid-master': 'hybrid',
    'butterfly-hug': 'butterfly',
    'stalker-assassinate': 'stalker',
    'seer-wake': 'seer',
    'seer-check': 'seer',
    'guard-wake': 'guard',
    'silence-result': 'silence_elder',
    'witch-antidote': 'witch',
    'witch-antidote-action': 'witch',
    'witch-poison': 'witch',
    'witch-poison-action': 'witch'
  };

  if (eventType === 'wolf-wake' || eventType === 'wolf-leader' || eventType === 'wolf-vote') {
    return players
      .filter((player) => player.alive && (player.faction === 'wolves' || player.role === 'werewolf'))
      .map((player) => Number(player.id))
      .filter(Boolean);
  }

  if (eventType === 'lucky-seer-check') {
    return players
      .filter((player) => player.alive && player.blackMerchantGift?.action === 'inspectFaction' && !player.blackMerchantGift.used)
      .map((player) => Number(player.id))
      .filter(Boolean);
  }

  if (eventType === 'lucky-witch-poison') {
    return players
      .filter((player) => player.alive && player.blackMerchantGift?.action === 'poison' && !player.blackMerchantGift.used)
      .map((player) => Number(player.id))
      .filter(Boolean);
  }

  const role = roleByNightEvent[eventType];
  if (!role) return [];
  return players
    .filter((player) => player.alive && player.role === role)
    .map((player) => Number(player.id))
    .filter(Boolean);
}

function appendWitchNightActionBadges(badges: NightBadge[], night: WerewolfNight, nightActionType: string, players: Player[] = []): void {
  if (night.witchSaveTarget) {
    badges.push(createNightTargetBadge('antidote', night.witchSaveTarget, players, { prefix: '救', titlePrefix: '解救' }));
  } else if (hasCompletedWitchAntidoteAction(nightActionType)) {
    badges.push({ kind: 'antidote', label: '不救', use: false, title: '解药不用', theme: WEREWOLF_NIGHT_BADGE_THEME.muted });
  }

  if (night.witchPoisonTarget) {
    badges.push(createNightTargetBadge('poison', night.witchPoisonTarget, players, { prefix: '毒', titlePrefix: '毒药' }));
  } else if (nightActionType === 'witch-poison-action') {
    badges.push({ kind: 'poison', label: '不毒', use: false, title: '毒药不用', theme: WEREWOLF_NIGHT_BADGE_THEME.muted });
  }
}

function createNightTargetBadge(kind: string, target: string, players: Player[], options: NightBadgeOptions = {}): NightBadge {
  const seatNumber = getWerewolfSeatNumber(target, players) || null;
  const targetLabel = seatNumber ? `${seatNumber}号` : `空守`;
  return {
    kind,
    target,
    targetLabel,
    use: Boolean(seatNumber),
    prefix: options.prefix,
    result: options.result,
    theme: options.theme,
    title: `${options.titlePrefix || ''} ${targetLabel}${options.titleSuffix || ''}`.trim()
  };
}

function hasCompletedWitchAntidoteAction(nightActionType: string): boolean {
  // 只在解药行动完成阶段展示"不救"badge，毒药阶段不展示解药相关信息
  return nightActionType === 'witch-antidote-action';
}

function getSeerCheckTheme(result?: string): NightBadgeTheme {
  const text = String(result || '');
  if (text.includes('狼人') || text.toLowerCase().includes('wolf')) return WEREWOLF_NIGHT_BADGE_THEME.danger;
  if (text.includes('好人') || text.includes('善') || text.toLowerCase().includes('good')) return WEREWOLF_NIGHT_BADGE_THEME.safe;
  return WEREWOLF_NIGHT_BADGE_THEME.default;
}

function formatNightSummary(round: WerewolfRound | null, players: Player[], showRoles: boolean, visibleRolePlayerId?: string | number | null): string {
  const deaths = round?.night?.deaths || [];
  if (deaths.length) {
    return `${deaths
      .map((death: { id: string; reason?: string }) => formatWerewolfRecordPlayer(death.id, players, showRoles, visibleRolePlayerId, death.reason))
      .join('、')} 死亡`;
  }

  const wolfTarget = round?.night?.wolfTarget;
  const witchSaved = round?.night?.witchSave;
  const guardTarget = round?.night?.guardTarget;
  const guardSaved = wolfTarget && guardTarget && Number(wolfTarget) === Number(guardTarget);

  if (wolfTarget) {
    const target = formatWerewolfRecordPlayer(wolfTarget, players, showRoles, visibleRolePlayerId);
    const result = witchSaved ? '女巫解救' : guardSaved ? '守护成功' : '无人死亡';
    return `刀口 ${target}：${result}`;
  }

  return round?.phase === 'night' ? '等待夜晚结算' : '平安夜';
}

function getVoteSummary(round: WerewolfRound | null, players: Player[] = []): string {
  if (!round) return '';
  if (round.idiotReveal) return `投票结束：${formatWerewolfSeatLabel(round.idiotReveal.id, players)}翻牌免除放逐。`;
  if (round.exile) return `投票结束：${formatWerewolfSeatLabel(round.exile.id, players)}被放逐。`;
  return '投票出现平票，本轮无人被放逐。';
}

function formatWerewolfRecordPlayer(playerId: string | number, players: Player[], showRoles: boolean, visibleRolePlayerId?: string | number | null, reason?: string): string {
  const player = players.find((item) => Number(item.id) === Number(playerId));
  const name = formatWerewolfSeatLabel(playerId, players);
  const role = player ? getVisibleRoleText(player, showRoles, visibleRolePlayerId) : '';
  const detail = [role, reason].filter(Boolean).join(' · ');
  return `${name}${detail ? `?${detail}?` : ''}`;
}

export function getVisibleRoleText(player: Player, showRoles: boolean, visibleRolePlayerId?: string | number | null): string {
  if (showRoles || Number(player.id) === Number(visibleRolePlayerId)) return ROLE_NAMES[player.roleLabel || ''] || player.roleLabel || ROLE_NAMES[player.role || ''] || '未知身份';
  return '身份隐藏';
}

export function getRoleDescription(player: Player, roleVisible: boolean): string {
  if (!roleVisible) return '玩家视角下，本局仅公开一名随机玩家身份；该玩家身份暂时隐藏。';
  const role = ROLE_NAMES[player.roleLabel || ''] || player.roleLabel || ROLE_NAMES[player.role || ''] || '未知身份';
  const descriptions: Record<string, string> = {
    wolf_beauty: 'Wolf team. Charms one player at night; when wolf beauty dies, the charmed player dies with her.',
    demon: 'Wolf team. Inspects whether one player is a god role at night and is immune to witch poison.',
    evil_knight: '狼人阵营，参与狼队刀人；首次被女巫毒或预言家查验时反伤对应神职。',
    old_rogue: '平民阵营统计，被女巫毒或猎人枪击后不立即死亡，次日白天发言结束后死亡。',
    nightmare: 'Wolf team. Fears one player at night to block that player skill; cannot fear the same target on consecutive nights.',
    white_wolf_king: '狼人阵营，夜晚参与狼队刀人，白天发言阶段可自爆并带走一名存活玩家。',
    big_bad_wolf: '狼人阵营，夜晚参与狼队行动；每局一次可在狼队刀口后额外袭击一名非狼人玩家。',
    magic_wolf: '狼人阵营，夜晚参与狼队行动；自爆后会封印下一夜神职技能，末狼被放逐时延迟到下一次天亮后死亡。',
    spirit_wolf: '狼人阵营，首夜学习一名好人能力；学习预言家可查民神，学习女巫可用一次解药，学习猎人被放逐可开枪，学习守卫可夜间庇护，学习平民被预言家查验显示好人。',
    demon_hunter: '好人阵营神职，从第二夜开始每晚狩猎一名玩家；猎中狼人则狼人死亡，猎中好人则自己死亡，并免疫女巫毒药。',
    hidden_wolf: '狼人阵营的隐藏狼，预言家查验显示为好人；特定板子中普通狼人全灭后会随狼队出局。',
    fortune_teller: '好人阵营神职，每局一次在夜晚标记一名存活非自己玩家。',
    crow: '好人阵营神职，每晚诅咒一名存活玩家，不能连续两晚诅咒同一目标；被诅咒者白天放逐票数 +1。',
    bear_tamer: '好人阵营神职，天亮后根据相邻座位是否有狼人展示咆哮或安静。',
    escape_hunter: '猎人阵营，夜间共同商议并投票猎杀一名非猎人玩家，死亡时可开枪。',
    tamed_werewolf: '好人阵营，被驯化后不参与夜间猎杀，需要与厚皮狼共同存活并找出猎人。',
    thick_wolf: '好人阵营，首次被猎人夜间猎杀时以护甲抵挡，第二次被猎杀才会死亡。',
    hybrid: '平民阵营统计，首夜选择一名主人，只知道主人座位；赛后按主人阵营记录个人胜负。',
    silence_elder: '好人阵营神职，每晚可禁言一名存活玩家，不能连续两晚禁言同一目标；被禁言者次日跳过发言但仍可投票。',
    knight: '好人阵营神职，全局一次白天决斗；决斗狼人则目标死亡并跳过当天放逐，决斗好人则骑士死亡且当天继续放逐。',
    stalker: '好人阵营神职，全局一次；若白天所投玩家未被放逐，当晚可暗杀该玩家。',
    butterfly: '好人阵营神职，夜晚最多两次抱人，使目标当晚特殊能力失效；抱到狼人则狼队不能刀人。',
    werewolf: '狼人阵营，夜晚参与击杀，白天需要伪装好人、引导票型并保护狼队友。',
    seer: '好人阵营神职，夜晚可以查验一名玩家阵营，白天需要谨慎传递信息。',
    witch: '好人阵营神职，拥有一次解药和一次毒药，需要根据夜晚死亡信息判断用药。',
    hunter: '好人阵营神职，死亡或被放逐时可选择开枪带走一名玩家。',
    idiot: '好人阵营神职，被白天放逐时可翻牌免死，但之后失去投票权。',
    guard: '好人阵营神职，夜晚守护一名玩家，不能连续两晚守护同一人。',
    villager: '好人阵营平民，没有夜晚技能，依靠发言、票型和死亡信息寻找狼人。'
  };
  return `${role}：${descriptions[player.role || ''] || '根据公开发言和阶段信息参与判断。'}`;
}
