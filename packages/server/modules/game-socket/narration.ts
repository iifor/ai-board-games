import {
  getWerewolfNightPrompt,
  buildSheriffStartMessage,
  buildSheriffResultMessage,
} from '../werewolf/announcements';

interface SpeechData {
  text?: string;
  playerId?: number | string;
  side?: string;
  speakerLabel?: string;
  [key: string]: unknown;
}

interface TestimonyData {
  text?: string;
  testimony?: string;
  playerId?: number | string;
  [key: string]: unknown;
}

interface SeerCheckData {
  target?: string;
  result?: string;
  [key: string]: unknown;
}

interface SheriffTransferData {
  action?: string;
  to?: number | string;
  [key: string]: unknown;
}

interface ShotData {
  from?: number | string;
  target?: number | string;
  [key: string]: unknown;
}

interface DaySpeechData {
  source?: string;
  anchorPlayerId?: boolean;
  direction?: string;
  startPlayerId?: number | string;
  [key: string]: unknown;
}

interface GamePlayer {
  id?: number | string;
  side?: string;
  sideLabel?: string;
  debateRoleLabel?: string;
  nickname?: string;
  [key: string]: unknown;
}

interface GameData {
  type?: string;
  winner?: string;
  winReason?: string;
  players?: GamePlayer[];
  host?: Record<string, unknown>;
  mvp?: { id?: number | string; nickname?: string; [key: string]: unknown } | null;
  werewolfMode?: Record<string, unknown>;
  [key: string]: unknown;
}

interface PhaseData {
  name?: string;
  [key: string]: unknown;
}

interface RoundData {
  sheriffElection?: Record<string, unknown>;
  daySpeech?: DaySpeechData;
  [key: string]: unknown;
}

interface NarrationEvent {
  type?: string;
  message?: string;
  presentation?: {
    speakableText?: string;
    suppressSpeech?: boolean;
    requiresAck?: boolean;
  };
  game?: GameData;
  speech?: SpeechData;
  testimony?: TestimonyData;
  seerCheck?: SeerCheckData;
  sheriffTransfer?: SheriffTransferData;
  shot?: ShotData;
  phase?: PhaseData;
  round?: RoundData;
  [key: string]: unknown;
}

function getNarration(event: NarrationEvent): string {
  if (event.presentation?.suppressSpeech) return '';
  // 状态事件（行动完成/阶段结束）不播报，必须在 speakableText 之前检查
  if (isWerewolfStatusEvent(event)) return '';
  if (event.presentation?.speakableText) return event.presentation.speakableText;
  if (event.game?.type === 'werewolf') return getWerewolfNarration(event);
  if (event.game?.type === 'debate') return getDebateNarration(event);
  return event.message || '';
}

/** 行动完成 / 阶段结束：仅状态提示，不播报 */
function isWerewolfStatusEvent(event: NarrationEvent): boolean {
  const wf = String(event.workflowEvent || '');
  const evType = String(event.type || '');
  // 行动完成（xxx完成）—— EventBus(action-submitted) + legacy(werewolf_action_submitted)
  if (wf === 'werewolf_action_submitted' || wf === 'action-submitted') return true;
  if (evType === 'werewolf_action_submitted' || evType === 'action-submitted') return true;
  // 阶段结束：夜间闭眼类保留，白天环节结束不播报 —— EventBus(phase-end) + legacy(werewolf_phase_end)
  if (wf === 'werewolf_phase_end' || wf === 'phase-end'
      || evType === 'werewolf_phase_end' || evType === 'phase-end') {
    const at = String((event as Record<string, unknown>).actionType || '');
    if (at === 'wolf_vote' || at === 'wolf_speech') return false; // 狼人请闭眼 保留
    if (at === 'seer_check' || at === 'guard_protect' || at === 'witch_poison') return false; // 角色闭眼 保留
    return true; // 白天环节（发言结束/投票结束 等）不播报
  }
  return false;
}

function getWerewolfNarration(event: NarrationEvent): string {
  // 行动完成 / 阶段结束：仅状态提示，不播报
  if (isWerewolfStatusEvent(event)) return '';
  if (event.type === 'players') return '';
  if (event.type === 'phase-start') return event.message || '天黑请闭眼';
  if (event.type === 'wolf-wake') return event.message || getWerewolfNightPrompt('wolf-wake');
  if (event.type === 'wolf-leader') return '';
  if (event.type === 'wolf-speech') return event.speech?.text || '';
  if (event.type === 'seer-wake') return event.message || getWerewolfNightPrompt('seer-wake');
  if (event.type === 'seer-check') return getSeerCheckNarration(event.seerCheck);
  if (event.type === 'guard-wake') return event.message || getWerewolfNightPrompt('guard-wake');
  if (event.type === 'witch-antidote') return event.message || getWerewolfNightPrompt('witch-antidote');
  if (event.type === 'witch-poison') return event.message || getWerewolfNightPrompt('witch-poison');
  if (event.type === 'night-result') return event.message || '夜晚行动结算完毕';
  if (event.type === 'day-start') return event.message || '天亮了';
  if (event.type === 'sheriff-start') return event.message || buildSheriffStartMessage(event.round);
  if (event.type === 'sheriff-speech' || event.type === 'sheriff-runoff-speech')
    return event.speech?.text || '';
  if (event.type === 'sheriff-vote')
    return event.message || getSheriffVoteNarration(event.round, false);
  if (event.type === 'sheriff-runoff-vote')
    return event.message || getSheriffVoteNarration(event.round, true);
  if (event.type === 'sheriff-result')
    return event.message || buildSheriffResultMessage(event.round, event.game?.werewolfMode || {}, event.game?.players as Array<{ id: number }> | undefined);
  if (event.type === 'speech-order')
    return event.message || getWerewolfSpeechOrderNarration(event.round);
  if (event.type === 'sheriff-badge-transfer' || event.type === 'sheriff-badge-tear')
    return event.message || getSheriffBadgeNarration(event.sheriffTransfer);
  if (event.type === 'speech') return event.speech?.text || '';
  if (event.type === 'self-destruct') return event.speech?.text || event.message || '狼人自爆。';
  if (event.type === 'vote-result') return event.message || '白天投票结果公布';
  if (event.type === 'last-words' || event.type === 'exile-words')
    return event.testimony?.text || '';
  if ((event.workflowEvent === 'last-words' || event.workflowEvent === 'exile-words'))
    return event.testimony?.text || event.speech?.text || '';
  if (event.type === 'hunter-shot')
    return `猎人开枪带走${event.shot?.target}号。`;
  if (event.type === 'idiot-reveal')
    return event.message || '白痴翻牌';
  if (event.type === 'game') {
    const winner = event.game?.winner === 'wolves' ? '狼人阵营胜利' : '好人阵营胜利';
    return `游戏结束。${winner}。${event.game?.winReason || ''}`;
  }
  return event.message || '';
}

function getSheriffVoteNarration(round: RoundData = {}, runoff: boolean): string {
  const election = (round.sheriffElection || {}) as Record<string, Record<string, number>>;
  const tally = runoff ? election.runoffTally : election.tally;
  const entries = Object.entries(tally || {}).sort((a, b) => Number(b[1]) - Number(a[1]));
  if (!entries.length)
    return '未产生有效票型，本局没有警长';
  const topCount = Number(entries[0][1]);
  const topIds = entries
    .filter(([, count]) => Number(count) === topCount)
    .map(([id]) => Number(id));
  if (topIds.length > 1) {
    return runoff
      ? '未产生有效票型，本局没有警长'
      : `${topIds.map((id) => `${id}号`).join('和')}票数相同，进行警长复选`;
  }
  return `${topIds[0]}号当选警长`;
}

function getSeerCheckNarration(check: SeerCheckData = {}): string {
  if (!check?.target) return '';
  return `他的身份是${check.result || '未知'}。预言家请闭眼。`;
}

function getWerewolfSpeechOrderNarration(round: RoundData = {}): string {
  // 复用 announcements 中的统一逻辑
  const { buildDaySpeechOrderAnnouncement } = require('../werewolf/prompts/announcements');
  return buildDaySpeechOrderAnnouncement(round as Record<string, unknown>) || '';
}

function getSheriffBadgeNarration(transfer: SheriffTransferData = {}): string {
  if (transfer.action === 'transfer') return `警长将警徽移交给${transfer.to}号`;
  return '警长选择撕掉警徽。';
}

function getDebateNarration(event: NarrationEvent): string {
  if (event.type === 'players') return '比赛开始';
  if (event.type === 'phase-start')
    return event.message || `现在进入${event.phase?.name || '下一'}环节。`;
  if (event.type === 'phase-end')
    return event.message || `${event.phase?.name || '本'}环节结束。`;
  if (event.type === 'speech') {
    if (event.speech?.side === 'host') return `主持人点评。${event.speech.text}`;
    const player = event.game?.players?.find(
      (item) => Number(item.id) === Number(event.speech?.playerId),
    );
    const label =
      event.speech?.speakerLabel ||
      getDebatePlayerLabel(event.game?.players || [], event.speech?.playerId) ||
      (player ? `${player.sideLabel}${player.debateRoleLabel}` : '辩手');
    return `${label}发言。${event.speech?.text}`;
  }
  if (event.type === 'game') {
    const winner =
      event.game?.winner === 'pro' ? '正方' : event.game?.winner === 'con' ? '反方' : '双方平局';
    const mvp = event.game?.mvp
      ? `本场最佳辩手是 ${event.game.mvp.nickname || `${event.game.mvp.id}号`}。`
      : '';
    return `辩论赛进入赛果公布。${winner}。${mvp}`;
  }
  return event.message || '';
}

function getDebatePlayerLabel(players: GamePlayer[], playerId?: number | string): string {
  const player = players.find((item) => Number(item.id) === Number(playerId));
  if (!player) return '';
  if (player.side === 'judge') return '评委';
  const sidePlayers = players.filter((item) => item.side === player.side);
  const index = sidePlayers.findIndex((item) => Number(item.id) === Number(playerId));
  const sideLabel = player.side === 'pro' ? '正方' : '反方';
  return `${sideLabel}${['零', '一', '二', '三', '四'][index + 1] || index + 1}辩`;
}

export {
  getNarration,
  getWerewolfNarration,
  getDebateNarration,
  getSheriffVoteNarration,
  getWerewolfSpeechOrderNarration,
  getSheriffBadgeNarration,
  getDebatePlayerLabel,
  isWerewolfStatusEvent,
};
export type { NarrationEvent };
