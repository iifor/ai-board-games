import { WEREWOLF } from '@ai-presenter/shared/constants/gameLimits';
import { getRoleLabel, getSeatNumber } from '../utils';

interface PromptAgent {
  id: number;
  role?: string;
  roleLabel?: string;
  faction?: string;
  alive?: boolean;
  deathDay?: number | null;
  deathReason?: string;
  canVote?: boolean;
  usedAntidote?: boolean;
  usedPoison?: boolean;
  lastGuardTarget?: number | null;
  seerChecks?: Array<Record<string, unknown>>;
  playerAgent?: { messages?: Array<{ role: string; content: string }> };
  [key: string]: unknown;
}

interface PromptRound {
  day?: number;
  publicSummary?: string;
  night?: {
    deaths?: Array<{ id: number; reason?: string }>;
    wolfTarget?: number | null;
    wolfStrategy?: string;
    wolfSpeeches?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  nightRevealed?: boolean;
  speeches?: Array<Record<string, unknown>>;
  votes?: Record<string, number | null>;
  voteTally?: Record<string, number>;
  exile?: { id: number; reason?: string } | null;
  idiotReveal?: { id: number; reason?: string } | null;
  hunterShot?: { from?: number; target?: number; reason?: string } | null;
  selfDestruct?: { playerId?: number; text?: string } | null;
  sheriffId?: number | null;
  sheriffBadge?: Record<string, unknown>;
  sheriffElection?: Record<string, unknown> | null;
  sheriffTransfers?: Array<Record<string, unknown>>;
  lastWords?: Array<Record<string, unknown>>;
  daySpeech?: Record<string, unknown> | null;
  [key: string]: unknown;
}

interface PromptState {
  rounds?: PromptRound[];
  players?: PromptAgent[];
  modeConfig?: Record<string, unknown>;
  werewolfMode?: Record<string, unknown>;
  [key: string]: unknown;
}

interface PromptRuntime {
  agents: PromptAgent[];
  state: PromptState;
  modeConfig?: Record<string, unknown>;
}

interface PromptBundleInput {
  runtime: PromptRuntime;
  round: PromptRound;
  actor: PromptAgent;
  actionType: string;
  taskInstruction?: string;
  outputContract?: string;
  recentContext?: string;
  validTargetIds?: number[];
}

interface WerewolfPromptBundle {
  systemRules: string;
  publicFacts: string;
  privateKnowledge: string;
  recentContext: string;
  taskInstruction: string;
  outputContract: string;
}

function buildWerewolfPromptBundle(input: PromptBundleInput): WerewolfPromptBundle {
  const hasConversationHistory = Number(input.actor.playerAgent?.messages?.length || 0) > 1;
  return {
    systemRules: buildSystemRules(input),
    publicFacts: buildPublicFacts(input.runtime.state, input.runtime.agents, !hasConversationHistory),
    privateKnowledge: buildPrivateKnowledge(input.actor, input.runtime.agents, input.round, input.actionType),
    recentContext: input.recentContext !== undefined
      ? input.recentContext
      : buildRecentContext(input.runtime.state.rounds || [], input.runtime.agents, input.actor),
    taskInstruction: input.taskInstruction || '',
    outputContract: input.outputContract || buildDefaultOutputContract(input.actionType, input.validTargetIds),
  };
}

function renderWerewolfPromptBundle(bundle: WerewolfPromptBundle): string {
  return [
    section('系统规则', bundle.systemRules),
    section('公开事实', bundle.publicFacts),
    section('你的私密信息', bundle.privateKnowledge),
    section('近期上下文', bundle.recentContext),
    section('本次任务', bundle.taskInstruction),
    section('输出格式', bundle.outputContract),
  ].filter(Boolean).join('\n\n');
}

function buildWerewolfActionPrompt(input: PromptBundleInput): string {
  return renderWerewolfPromptBundle(buildWerewolfPromptBundle(input));
}

function buildSystemRules(input: PromptBundleInput): string {
  const day = Number(input.round.day || 1);
  return [
    `当前轮次：第${day}天；当前行动：${input.actionType}。`,
    '沿用开局规则和已有会话，只处理本次新增信息与当前任务。',
  ].join('\n');
}

function buildPublicFacts(state: PromptState, agents: PromptAgent[], includeHistory: boolean): string {
  const rounds = state.rounds || [];
  const lines: string[] = [
    formatPlayerStatus(agents),
  ];
  const visibleRounds = includeHistory ? rounds : rounds.slice(-1);
  for (const round of visibleRounds) {
    lines.push(...formatRoundFacts(round, agents));
  }
  if (!includeHistory) {
    const currentRound = visibleRounds[0];
    const latestVoteRound = [...rounds].reverse().find(hasDayVotes);
    if (latestVoteRound && Number(latestVoteRound.day) !== Number(currentRound?.day)) {
      lines.push(...formatDayVoteFacts(latestVoteRound, agents));
    }
  }
  return lines.filter(Boolean).join('\n') || '暂无公开事实。';
}

function buildPrivateKnowledge(actor: PromptAgent, agents: PromptAgent[], round: PromptRound, actionType: string): string {
  const lines = [
    `你是${getSeatNumber(actor.id, agents)}号；身份：${getRoleLabel(actor)}；阵营：${actor.faction || '未知'}；状态：${actor.alive === false ? '已出局' : '存活'}。`,
  ];
  if (actor.faction === 'wolves') lines.push(formatWolfPrivateInfo(actor, agents, round));
  if (actor.role === 'seer') lines.push(formatSeerChecks(actor, agents));
  if (actor.role === 'witch') lines.push(`女巫状态：解药${actor.usedAntidote ? '已使用' : '未使用'}；毒药${actor.usedPoison ? '已使用' : '未使用'}。`);
  if (actor.role === 'guard') {
    const guarded = actor.lastGuardTarget ? `${getSeatNumber(Number(actor.lastGuardTarget), agents)}号` : '无';
    lines.push(`守卫状态：上一晚守护目标：${guarded}。`);
  }
  if (actionType === 'witch_save' && round.night?.wolfTarget) {
    lines.push(`今晚狼刀目标：${getSeatNumber(Number(round.night.wolfTarget), agents)}号。`);
  }
  return lines.filter(Boolean).join('\n');
}

function buildRecentContext(rounds: PromptRound[], agents: PromptAgent[], actor: PromptAgent): string {
  const current = rounds[rounds.length - 1];
  if (!current) return '';
  const entries: string[] = [];
  const election = current.sheriffElection;
  const sheriffSpeeches = Array.isArray(election?.speeches) ? election.speeches : [];
  const runoffSpeeches = Array.isArray(election?.runoffSpeeches) ? election.runoffSpeeches : [];
  sheriffSpeeches.forEach((speech) => {
    entries.push(`警上发言：${formatPlayerRef(speech.playerId, agents)}：${speech.text || ''}`);
  });
  runoffSpeeches.forEach((speech) => {
    entries.push(`警长复投发言：${formatPlayerRef(speech.playerId, agents)}：${speech.text || ''}`);
  });
  if (actor.faction === 'wolves') {
    const wolfSpeeches = current.night?.wolfSpeeches || [];
    wolfSpeeches.slice(-4).forEach((speech) => {
      entries.push(`狼队夜聊：${formatPlayerRef(speech.playerId, agents)}：${speech.text || ''}`);
    });
  }
  (current.speeches || []).slice(-8).forEach((speech) => {
    entries.push(`白天发言：${formatPlayerRef(speech.playerId, agents)}：${speech.text || ''}`);
  });
  (current.lastWords || []).slice(-3).forEach((words) => {
    entries.push(`遗言：${formatPlayerRef(words.playerId, agents)}：${words.text || ''}`);
  });
  return entries.join('\n');
}

function buildDefaultOutputContract(actionType: string, validTargetIds?: number[]): string {
  if (actionType.includes('speech')) {
    return `只输出自然语言发言，不超过 ${WEREWOLF.DAY_SPEECH_CHAR_LIMIT} 字。`;
  }
  if (validTargetIds?.length) {
    return `只返回标准 JSON 对象，不要输出 Markdown 或解释。目标必须从这些座位号中选择：${validTargetIds.join('、')}。`;
  }
  return '按本次任务要求输出；需要 JSON 时只返回原始 JSON 对象。';
}

function formatRoundFacts(round: PromptRound, agents: PromptAgent[]): string[] {
  const day = Number(round.day || 0);
  const lines: string[] = [];
  const deaths = round.night?.deaths || [];
  if (round.nightRevealed !== false && deaths.length) {
    lines.push(`第${day}晚死亡：${deaths.map((death) => `${getSeatNumber(Number(death.id), agents)}号`).join('、')}。`);
  }
  const electedSheriffId = Number((round.sheriffElection as { sheriffId?: unknown } | null)?.sheriffId || 0);
  if (electedSheriffId) {
    lines.push(`${getSeatNumber(electedSheriffId, agents)}号玩家当选警长。`);
  }
  for (const transfer of round.sheriffTransfers || []) {
    if (transfer.action === 'transfer' && transfer.to) {
      lines.push(`警长把警徽移交给${getSeatNumber(Number(transfer.to), agents)}号玩家。`);
    } else if (transfer.action === 'tear') {
      lines.push('警长决定撕掉警徽。');
    }
  }
  if (round.exile) lines.push(`第${day}天放逐结果：${getSeatNumber(Number(round.exile.id), agents)}号被放逐出局。`);
  if (round.idiotReveal) lines.push(`第${day}天白痴翻牌：${getSeatNumber(Number(round.idiotReveal.id), agents)}号免除放逐并失去投票权。`);
  if (round.hunterShot?.from && round.hunterShot?.target) {
    lines.push(`第${day}天猎人开枪：${getSeatNumber(Number(round.hunterShot.from), agents)}号带走${getSeatNumber(Number(round.hunterShot.target), agents)}号。`);
  }
  if (round.selfDestruct?.playerId) {
    lines.push(`第${day}天自爆：${getSeatNumber(Number(round.selfDestruct.playerId), agents)}号狼人自爆，白天流程中止。`);
  }
  lines.push(...formatDayVoteFacts(round, agents));
  const electionFacts = formatSheriffElectionFacts(day, round.sheriffElection, agents);
  if (electionFacts) lines.push(electionFacts);
  return lines;
}

function formatDayVoteFacts(round: PromptRound, agents: PromptAgent[]): string[] {
  const day = Number(round.day || 0);
  const lines: string[] = [];
  if (hasDayVotes(round)) lines.push(`第${day}天放逐投票：${formatVotes(round.votes!, agents)}。`);
  if (round.voteTally && Object.keys(round.voteTally).length) {
    lines.push(`第${day}天放逐票型：${formatTally(round.voteTally, agents)}。`);
  }
  return lines;
}

function hasDayVotes(round: PromptRound | undefined): boolean {
  return Boolean(round?.votes && Object.keys(round.votes).length);
}

function formatPlayerStatus(agents: PromptAgent[]): string {
  const alive = agents.filter((agent) => agent.alive !== false).map((agent) => `${getSeatNumber(agent.id, agents)}号`);
  const dead = agents.filter((agent) => agent.alive === false).map((agent) => `${getSeatNumber(agent.id, agents)}号`);
  return [
    `存活玩家：${alive.join('、') || '无'}。`,
    `已出局玩家：${dead.join('、') || '无'}。`,
  ].join('\n');
}

function formatWolfPrivateInfo(actor: PromptAgent, agents: PromptAgent[], round: PromptRound): string {
  const teammates = agents
    .filter((agent) => agent.faction === 'wolves' && Number(agent.id) !== Number(actor.id))
    .map((agent) => `${getSeatNumber(agent.id, agents)}号（${getRoleLabel(agent)}，${agent.alive === false ? '已出局' : '存活'}）`);
  const strategy = round.night?.wolfStrategy ? `狼队刀口共识：${round.night.wolfStrategy}` : '';
  return [`狼队友：${teammates.join('、') || '无其他狼队友'}。`, strategy].filter(Boolean).join('\n');
}

function formatSeerChecks(actor: PromptAgent, agents: PromptAgent[]): string {
  const checks = Array.isArray(actor.seerChecks) ? actor.seerChecks : [];
  if (!checks.length) return '预言家查验记录：暂无。';
  return `预言家查验记录：${checks.map((check, index) => {
    const day = Number(check.day || index + 1);
    const target = Number(check.target || 0);
    const result = String(check.result || check.faction || '未知');
    return `第${day}晚查验${target ? getSeatNumber(target, agents) : '?'}号，结果：${result}`;
  }).join('；')}。`;
}

function formatSheriffElectionFacts(day: number, election: Record<string, unknown> | null | undefined, agents: PromptAgent[]): string {
  if (!election) return '';
  const parts: string[] = [];
  if (Array.isArray(election.signedUpIds) && election.signedUpIds.length) parts.push(`上警：${formatIds(election.signedUpIds as number[], agents)}`);
  if (Array.isArray(election.withdrawnIds) && election.withdrawnIds.length) parts.push(`退水：${formatIds(election.withdrawnIds as number[], agents)}`);
  if (election.votes && Object.keys(election.votes as Record<string, number | null>).length) parts.push(`警长投票：${formatVotes(election.votes as Record<string, number | null>, agents)}`);
  if (election.runoffVotes && Object.keys(election.runoffVotes as Record<string, number | null>).length) parts.push(`警长复投：${formatVotes(election.runoffVotes as Record<string, number | null>, agents)}`);
  return parts.length ? `第${day}天警长流程：${parts.join('；')}。` : '';
}

function formatVotes(votes: Record<string, number | null>, agents: PromptAgent[]): string {
  return Object.entries(votes)
    .sort(([left], [right]) => getSeatNumber(Number(left), agents) - getSeatNumber(Number(right), agents))
    .map(([from, to]) => {
      const voter = `${getSeatNumber(Number(from), agents)}号`;
      return to == null ? `${voter}弃票` : `${voter}投${getSeatNumber(Number(to), agents)}号`;
    })
    .join('、');
}

function formatTally(tally: Record<string, number>, agents: PromptAgent[]): string {
  return Object.entries(tally)
    .sort(([left], [right]) => getSeatNumber(Number(left), agents) - getSeatNumber(Number(right), agents))
    .map(([target, count]) => `${getSeatNumber(Number(target), agents)}号${count}票`)
    .join('、');
}

function formatIds(ids: number[], agents: PromptAgent[]): string {
  return ids.map((id) => `${getSeatNumber(Number(id), agents)}号`).join('、');
}

function formatPlayerRef(value: unknown, agents: PromptAgent[]): string {
  const id = Number(value);
  return Number.isFinite(id) && id > 0 ? `${getSeatNumber(id, agents)}号` : String(value || '未知');
}

function section(title: string, content: string): string {
  const body = String(content || '').trim();
  return body ? `【${title}】\n${body}` : '';
}

export {
  buildWerewolfPromptBundle,
  buildWerewolfActionPrompt,
  renderWerewolfPromptBundle,
};

export type {
  WerewolfPromptBundle,
  PromptBundleInput,
};
