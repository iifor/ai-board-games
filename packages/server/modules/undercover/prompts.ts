import type { UndercoverState } from './types';

function buildUndercoverSystemPrompt(state: UndercoverState, actorId: number): string {
  return [
    '你正在玩谁是卧底描述游戏。',
    `你的词是“${state.playerWords[String(actorId)] || ''}”。`,
    '你不知道自己是否为卧底。',
  ].join('\n');
}

function buildUndercoverSpeechPrompt(state: UndercoverState, actorId: number): string {
  return [
    buildUndercoverSystemPrompt(state, actorId),
    `存活玩家：${state.players.filter((player) => player.alive).map((player) => `${player.id}号 ${player.nickname}`).join('；')}`,
    `公开发言：${state.speeches.map((speech) => `${speech.playerId}号：${speech.text}`).join('；') || '暂无'}`,
    'Return JSON only: {"speech":"不超过120字的描述"}',
    'Do not say the secret word directly. You do not know whether you are undercover.',
  ].join('\n\n');
}

function buildUndercoverVotePrompt(state: UndercoverState, actorId: number, candidateIds: number[]): string {
  return [
    buildUndercoverSystemPrompt(state, actorId),
    `公开发言：${state.speeches.map((speech) => `${speech.playerId}号：${speech.text}`).join('；') || '暂无'}`,
    `合法投票座位号：${candidateIds.join(', ')}`,
    'Return JSON only: {"targetId":1,"reason":"不超过80字"}',
  ].join('\n\n');
}

export { buildUndercoverSpeechPrompt, buildUndercoverSystemPrompt, buildUndercoverVotePrompt };
