// werewolf/announcements is still JS — use require for now
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  getWerewolfNightPrompt,
  buildSheriffStartMessage,
  buildSheriffResultMessage,
} = require('../werewolf/announcements');

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
  if (event.game?.type === 'werewolf') return getWerewolfNarration(event);
  if (event.game?.type === 'debate') return getDebateNarration(event);
  return event.message || '';
}

function getWerewolfNarration(event: NarrationEvent): string {
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
    return event.message || buildSheriffResultMessage(event.round, event.game?.werewolfMode || {});
  if (event.type === 'speech-order')
    return event.message || getWerewolfSpeechOrderNarration(event.round);
  if (event.type === 'sheriff-badge-transfer' || event.type === 'sheriff-badge-tear')
    return event.message || getSheriffBadgeNarration(event.sheriffTransfer);
  if (event.type === 'speech') return event.speech?.text || '';
  if (event.type === 'vote-result') return event.message || '白天投票结果公布';
  if (event.type === 'last-words' || event.type === 'exile-words')
    return event.testimony?.text || '';
  if (event.type === 'hunter-shot')
    return `猎人发动技能，${event.shot?.from}号带走${event.shot?.target}号。`;
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
    return runoff ? '警长复投未产生有效票型。' : '警长竞选投票未产生有效票型。';
  const topCount = Number(entries[0][1]);
  const topIds = entries
    .filter(([, count]) => Number(count) === topCount)
    .map(([id]) => Number(id));
  if (topIds.length > 1)
    return `${runoff ? '警长复投' : '警长竞选投票'}平票：${topIds.map((id) => `${id}号`).join('、')}。`;
  return `${runoff ? '警长复投' : '警长竞选投票'}最高票为${topIds[0]}号。`;
}

function getSeerCheckNarration(check: SeerCheckData = {}): string {
  if (!check?.target) return '';
  return `他的身份是${check.result || '未知'}。预言家请闭眼。`;
}

function getWerewolfSpeechOrderNarration(round: RoundData = {}): string {
  if (round.daySpeech?.source === 'sheriff') {
    if (round.daySpeech.anchorPlayerId) {
      return `警长决定${round.daySpeech.direction === 'counterclockwise' ? '逆时针' : '顺时针'}发言，从${round.daySpeech.startPlayerId}号开始发言`;
    }
    return `警长决定${round.daySpeech.direction === 'counterclockwise' ? '逆时针' : '顺时针'}发言，${round.daySpeech.startPlayerId}号发言`;
  }
  if (round.daySpeech?.source === 'night-death') {
    return `从${round.daySpeech.startPlayerId}号开始发言。`;
  }
  return round.daySpeech?.startPlayerId ? `从${round.daySpeech.startPlayerId}号开始发言` : '';
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
};
export type { NarrationEvent };
