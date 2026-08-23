import type { AvalonState } from './types';
import { getCurrentMission, getPrivateKnowledge, getRoleLabel } from './rules';

function buildAvalonSystemPrompt(state: AvalonState, actorId: number): string {
  const actor = state.players.find((player) => player.id === actorId);
  if (!actor) throw new Error(`Avalon actor not found: ${actorId}`);
  return [
    '你正在参加 5 人标准阿瓦隆。你必须遵守服务端给出的合法选项并只输出 JSON。',
    `你是 ${actor.id}号${actor.nickname}，身份是${getRoleLabel(actor.role)}，阵营是${actor.faction === 'good' ? '好人' : '邪恶'}。`,
    getPrivateKnowledge(state, actorId),
    '不得在公开理由中直接泄露你的角色或私密视野。',
  ].join('\n');
}

function buildProposalPrompt(state: AvalonState, legalIds: number[]): string {
  const mission = getCurrentMission(state);
  return `第${mission.number}个任务需要 ${mission.teamSize} 人。请从 [${legalIds.join(', ')}] 中选择不重复队员，输出 {"teamIds":[...],"reason":"简短公开理由"}。`;
}

function buildTeamVotePrompt(state: AvalonState): string {
  return `队长提议队伍 [${state.currentTeamIds.join(', ')}]。输出 {"approve":true|false,"reason":"简短公开理由"}。`;
}

function buildQuestVotePrompt(state: AvalonState, actorId: number): string {
  const actor = state.players.find((player) => player.id === actorId)!;
  return actor.faction === 'good'
    ? '你必须执行成功票。输出 {"success":true}。'
    : '你可以选择成功或失败票。输出 {"success":true|false}。';
}

function buildAssassinationPrompt(state: AvalonState, legalIds: number[]): string {
  return `好人已完成三个任务。请从好人候选 [${legalIds.join(', ')}] 中判断梅林，输出 {"targetId":数字,"reason":"简短推理"}。`;
}

export {
  buildAssassinationPrompt,
  buildAvalonSystemPrompt,
  buildProposalPrompt,
  buildQuestVotePrompt,
  buildTeamVotePrompt,
};
