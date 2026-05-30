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
    return `${formatWerewolfSeatLabel(event.speech?.playerId || event.selfDestruct?.playerId || '', players)}狼人自爆，白天流程中止。`;
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
  if (id === 'villager' || id === 'civilian' || name.includes('村民') || name.includes('平民')) return 'villagers';
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
  return `${night} ? ${exile}`;
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
  return event?.presentation?.displayText || event?.message || '';
}

export function getWerewolfFlowLabel(event: GameEvent | null | undefined): string {
  if (event?.type === 'seer-check') return event.message || '预言家查验结果';
  const labels: Record<string, string> = {
    'wolf-wake': '狼人行动',
    'wolf-leader': '狼队领袖指定',
    'seer-wake': '预言家查验',
    'guard-wake': '守卫守护',
    'witch-antidote': '女巫解药',
    'witch-poison': '女巫毒药'
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
  if (!round?.night || !player || round.phase !== 'night') return [];
  const night = round.night;
  const badges: NightBadge[] = [];

  const wolfVoteTarget = night.wolfChoices?.[player.id];
  if (wolfVoteTarget && (player.faction === 'wolves' || player.role === 'werewolf')) {
    if (nightActionType === 'wolf-wake' || nightActionType === 'wolf-leader') {
      badges.push(createNightTargetBadge('wolf', wolfVoteTarget, players, { titlePrefix: '夜投' }));
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
  if (player.role === 'witch') {
    if (['witch-antidote', 'witch-antidote-action', 'witch-poison', 'witch-poison-action'].includes(nightActionType)) {
      appendWitchNightActionBadges(badges, night, nightActionType, players);
    }
  }
  return badges;
}

export function getNightActionPlayerIds(eventType: string, players: Player[] = []): number[] {
  const roleByNightEvent: Record<string, string> = {
    'seer-wake': 'seer',
    'seer-check': 'seer',
    'guard-wake': 'guard',
    'witch-antidote': 'witch',
    'witch-antidote-action': 'witch',
    'witch-poison': 'witch',
    'witch-poison-action': 'witch'
  };

  if (eventType === 'wolf-wake' || eventType === 'wolf-leader') {
    return players
      .filter((player) => player.alive && (player.faction === 'wolves' || player.role === 'werewolf'))
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
    badges.push({ kind: 'antidote', label: '不救', title: '解药不用', theme: WEREWOLF_NIGHT_BADGE_THEME.muted });
  }

  if (night.witchPoisonTarget) {
    badges.push(createNightTargetBadge('poison', night.witchPoisonTarget, players, { prefix: '毒', titlePrefix: '毒药' }));
  } else if (nightActionType === 'witch-poison-action') {
    badges.push({ kind: 'poison', label: '不毒', title: '毒药不用', theme: WEREWOLF_NIGHT_BADGE_THEME.muted });
  }
}

function createNightTargetBadge(kind: string, target: string, players: Player[], options: NightBadgeOptions = {}): NightBadge {
  const seatNumber = getWerewolfSeatNumber(target, players);
  const targetLabel = seatNumber ? `${seatNumber}号` : `${target}号`;
  return {
    kind,
    target,
    targetLabel,
    prefix: options.prefix,
    result: options.result,
    theme: options.theme,
    title: `${options.titlePrefix || ''} ${targetLabel}${options.titleSuffix || ''}`.trim()
  };
}

function hasCompletedWitchAntidoteAction(nightActionType: string): boolean {
  return ['witch-antidote-action', 'witch-poison', 'witch-poison-action'].includes(nightActionType);
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
