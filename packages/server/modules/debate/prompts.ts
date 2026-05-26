import { buildPlayerPersonaModule, compilePromptModules } from '../../services/ai/promptComposer';
import { cachedLlmCall } from '../llm';
import { callOpenAIChat } from '../llm';
import { DEBATE, PHASES } from './constants';
import type { DebatePhase } from './constants';
import type { DebatePlayer, DebateHost } from './utils';

interface HostConfig {
  apiKey?: string;
  baseUrl?: string;
  provider?: string;
  model?: string;
  apiFormat?: string;
  temperature?: number;
  [key: string]: unknown;
}

interface DebateConfig {
  host: HostConfig;
  _gameId?: string;
  [key: string]: unknown;
}

interface Topic {
  title: string;
  proPosition: string;
  conPosition: string;
}

function getDebateRoleName(agent: DebatePlayer | null | undefined): string {
  if (!agent) return '辩手';
  if (agent.side === 'judge') return '评委';
  const sideLabel = agent.side === 'pro' ? '正方' : '反方';
  const ordinal = ['零', '一', '二', '三', '四'][Number(agent.sideIndex || 0) + 1] || String(Number(agent.sideIndex || 0) + 1);
  return `${sideLabel}${ordinal}辩`;
}

function buildSystemPrompt(agent: DebatePlayer, topic: Topic, phase: DebatePhase = PHASES[0]): string {
  const personaModule = buildPlayerPersonaModule(agent as unknown as Parameters<typeof buildPlayerPersonaModule>[0]);
  if (agent.side === 'judge') {
    return compilePromptModules([
      '你是《AI 辩论赛》的评委。你不是正反方选手。',
      `你的场上称谓是${getDebateRoleName(agent)}。`,
      personaModule,
      '发言时不要自称几号，也不要用几号称呼自己；请以评委身份发言。',
      '你需要依据论点清晰度、反驳质量、团队协作、表达感染力进行判断。',
      '点评要具体指出双方亮点和问题，不能只说空话。',
      'MVP 投票必须从正反方 8 位选手中选择 1 位；投票任务只返回目标，不需要理由。',
      `严格遵守当前环节字数限制：${phase.limit}。`,
    ]).text as string;
  }

  return compilePromptModules([
    '你正在参加《AI 辩论赛》。你不是主持人。',
    `你的场上称谓是${getDebateRoleName(agent)}。`,
    personaModule,
    `你的阵营是：${agent.sideLabel}。你的身份是：${agent.debateRoleLabel}。`,
    `辩题：${topic.title}`,
    `你的立场：${agent.side === 'pro' ? topic.proPosition : topic.conPosition}`,
    '你的目标是帮助本方赢得辩论，同时保持自然、有个性的表达。',
    '发言时不要自称几号，也不要用几号称呼自己；',
    '必须围绕辩题发言；可以反驳、举例、追问、让步后反击，但不要编造不存在的赛制信息。',
    `严格遵守当前环节字数限制：${phase.limit}。`,
    '不要输出 JSON，除非主持人明确要求。',
    agent.debateRole === 'captain'
      ? '你是本方队长。你需要给队友制定战术：核心论点、攻击重点、防守底线、发言分工。战术部署只面向本方，不要写给对方或评委。'
      : '',
  ]).text as string;
}

function buildHostPrompt(topic: Topic, phaseName: string, options: { includeTopic?: boolean } = {}): string {
  return [
    '你是《AI 辩论赛》的主持人。你的职责是播报已经由系统确定的赛程、宣布辩题、介绍阵营、串联环节、总结公开结果，并保持节奏和公平。',
    '你不能决定流程走向，不能代替选手辩论，不能泄露队长私下部署内容，不能偏袒任一方。',
    `输出要像现场主持，简洁、有仪式感、信息明确。每次主持播报建议不超过 ${DEBATE.HOST_ANNOUNCE_CHAR_LIMIT} 字（弱约束，超出也正常输出）。`,
    options.includeTopic
      ? `本场开局首次播报可以介绍辩题和双方立场：辩题「${topic.title}」；正方「${topic.proPosition}」；反方「${topic.conPosition}」。`
      : '本场辩题和正反方立场已经在开局播报过。之后进入阶段时不要重复介绍辩题、正方观点或反方观点，只宣布当前环节和必要规则。',
    `当前环节：${phaseName}`,
  ].join('\n');
}

async function askHost(
  config: DebateConfig,
  topic: Topic,
  phaseName: string,
  prompt: string,
  maxTokens?: number,
  options: { includeTopic?: boolean; cacheable?: boolean } = {},
): Promise<string> {
  const effectiveMaxTokens = maxTokens || Math.ceil(DEBATE.HOST_ANNOUNCE_CHAR_LIMIT * 2.5);
  const messages = [
    { role: 'system' as const, content: buildHostPrompt(topic, phaseName, options) },
    { role: 'user' as const, content: prompt },
  ];
  const payload = {
    apiKey: config.host.apiKey,
    baseUrl: config.host.baseUrl,
    provider: config.host.provider,
    model: config.host.model,
    apiFormat: config.host.apiFormat,
    temperature: config.host.temperature,
    messages,
    maxTokens: effectiveMaxTokens,
    _gameId: config._gameId || null,
  };
  if (options.cacheable) {
    const cached = await (cachedLlmCall as (keys: unknown[], fn: () => Promise<string>) => Promise<{ value: string }>)(
      ['debate-host', config.host.provider, config.host.model, messages, effectiveMaxTokens],
      () => (callOpenAIChat as (payload: unknown) => Promise<string>)(payload),
    );
    return cached.value;
  }
  return (callOpenAIChat as (payload: unknown) => Promise<string>)(payload);
}

export { getDebateRoleName, buildSystemPrompt, buildHostPrompt, askHost };
export type { HostConfig, DebateConfig, Topic };
