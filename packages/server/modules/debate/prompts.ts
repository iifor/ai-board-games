import { buildPlayerPersonaModule, compilePromptModules } from '../../services/ai/promptComposer';
import { PHASES } from './constants';
import type { DebatePhase } from './constants';
import type { DebateHost, DebatePlayer } from './utils';

interface HostConfig extends DebateHost {
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
  const ordinal = ['一', '二', '三', '四'][Number(agent.sideIndex || 0)] || String(Number(agent.sideIndex || 0) + 1);
  return `${sideLabel}${ordinal}辩`;
}

function buildSystemPrompt(
  agent: DebatePlayer,
  topic: Topic,
  phase: DebatePhase = PHASES[0],
  relationshipMemory = '',
): string {
  const personaModule = buildPlayerPersonaModule(agent as unknown as Parameters<typeof buildPlayerPersonaModule>[0]);
  if (agent.side === 'judge') {
    return compilePromptModules([
      '你正在参加《AI 辩论赛》，你的身份是评委，不是主持人。',
      `你的场上称谓是${getDebateRoleName(agent)}。`,
      personaModule,
      '发言时不要自称几号，也不要用几号称呼自己；请以评委身份发言。',
      '你需要依据论点清晰度、反驳质量、团队协作、表达感染力进行判断。',
      '点评要具体指出双方亮点和问题，不能只说空话。',
      'MVP 投票必须从正反方选手中选择 1 位；投票任务只返回目标，不需要理由。',
      relationshipMemory,
      `严格遵守当前环节字数限制：${phase.limit}。`,
    ]).text as string;
  }

  return compilePromptModules([
    '你正在参加《AI 辩论赛》。你是参赛者，不是主持人。',
    `你的场上称谓是${getDebateRoleName(agent)}。`,
    personaModule,
    `你的阵营是：${agent.sideLabel}。你的身份是：${agent.debateRoleLabel}。`,
    `辩题：${topic.title}`,
    `你的立场：${agent.side === 'pro' ? topic.proPosition : topic.conPosition}`,
    '你的目标是帮助本方赢得辩论，同时保持自然、有个性的表达。',
    '像真人现场发言，避免论文腔、固定编号和空泛中立。',
    '发言时不要自称几号，也不要用几号称呼自己。',
    '必须围绕辩题发言；可以反驳、举例、追问、让步后反击，但不要编造不存在的赛制信息。',
    '除立论外，先回应争点，再提出一个清晰主张，并用事实、例子或因果解释支撑；允许简短让步后反击。',
    `严格遵守当前环节字数限制：${phase.limit}。`,
    '不要输出 JSON，除非系统任务明确要求。',
    agent.debateRole === 'captain'
      ? '你是本方队长。你需要给队友制定战术：核心论点、攻击重点、防守底线、发言分工。战术部署只面向本方，不要写给对方或评委。'
      : '',
    relationshipMemory,
  ]).text as string;
}

export { getDebateRoleName, buildSystemPrompt };
export type { HostConfig, DebateConfig, Topic };
