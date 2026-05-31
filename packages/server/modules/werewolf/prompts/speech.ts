// ============================================================
// 发言提示词 —— AI 玩家在不同场景下的发言请求
// 通过 options.thinking 控制是否启用推理链（thinking）
//   - thinking: false（默认）→ 调用 askText，返回 string | null
//   - thinking: true          → 调用 askTextWithThinking，返回 { content, thinking } | null
// ============================================================

import { WEREWOLF } from '@ai-presenter/shared/constants/gameLimits';
import { getRoleLabel, getSeatNumber } from '../utils';
import type { PlayerAgent } from '../playerAgent';

// ---- 轻量接口 ----

interface AgentLike {
  id: number;
  alive?: boolean;
  playerAgent: PlayerAgent;
  [key: string]: unknown;
}

interface WolfSpeech {
  playerId: number;
  text: string;
  [key: string]: unknown;
}

// ---- 白天发言 ----

export async function askSpeech(
  agent: AgentLike, day: number, context: string,
  options?: { thinking?: false; limit?: number }
): Promise<string | null>;
export async function askSpeech(
  agent: AgentLike, day: number, context: string,
  options: { thinking: true; limit?: number }
): Promise<{ content: string; thinking: string } | null>;
export async function askSpeech(
  agent: AgentLike,
  day: number,
  context: string,
  options: { thinking?: boolean; limit?: number } = {}
): Promise<string | { content: string; thinking: string } | null> {
  const limit = options.limit ?? WEREWOLF.DAY_SPEECH_CHAR_LIMIT;
  const prompt = [
    `第 ${day} 天白天发言。`,
    `公开赛况：\n${context || '暂无公开信息。'}`,
    `你的状态：${agent.alive ? '存活' : '已出局'}；身份：${getRoleLabel(agent as Record<string, unknown>)}`,
    `请发表自然语言发言，建议不超过 ${limit} 字。`
  ].join('\n\n');
  const apiOpts = { maxTokens: Math.ceil(limit * 2.5), limit };

  if (options.thinking) {
    return agent.playerAgent.askTextWithThinking(prompt, apiOpts);
  }
  return agent.playerAgent.askText(prompt, apiOpts);
}

// ---- 狼人夜聊 ----

export async function askWolfNightSpeech(
  agent: AgentLike, day: number, wolfSpeeches: WolfSpeech[], isLeader: boolean,
  options?: { thinking?: false; limit?: number; agents?: Array<{ id: number }> }
): Promise<string | null>;
export async function askWolfNightSpeech(
  agent: AgentLike, day: number, wolfSpeeches: WolfSpeech[], isLeader: boolean,
  options: { thinking: true; limit?: number; agents?: Array<{ id: number }> }
): Promise<{ content: string; thinking: string } | null>;
export async function askWolfNightSpeech(
  agent: AgentLike,
  day: number,
  wolfSpeeches: WolfSpeech[],
  isLeader: boolean,
  options: { thinking?: boolean; limit?: number; agents?: Array<{ id: number }> } = {}
): Promise<string | { content: string; thinking: string } | null> {
  const history = (wolfSpeeches || [])
    .filter((speech) => String(speech.playerId) !== '系统' && String(speech.playerId) !== 'host')
    .map((speech) => `${getSeatNumber(speech.playerId, options.agents)}号：${speech.text}`)
    .join('\n');
  const title = isLeader ? '请作为狼队队长作战术部署。' : '请基于当前已知信息和队长战术，进行发言讨论。';
  let limit = options.limit ?? WEREWOLF.WOLF_NIGHT_SPEECH_CHAR_LIMIT;
  if (isLeader && limit) {
    limit = limit * 1.5;
  }
  const sharedInfo = (wolfSpeeches || []).find((s) => String(s.playerId) === '系统');
  const contextLine = sharedInfo ? `【队伍信息】${sharedInfo.text}` : '';
  const historySection = history ? `已知狼队夜聊：\n${history}` : '';
  const prompt = [
    `第 ${day} 夜狼人行动。${title}`,
    contextLine,
    historySection,
    `可以选择不发言；发言时请只输出狼队战术发言，建议不超过 ${limit} 字。`
  ].filter(Boolean).join('\n\n');
  const apiOpts = { maxTokens: Math.ceil(limit * 2.5), limit };

  if (options.thinking) {
    return agent.playerAgent.askTextWithThinking(prompt, apiOpts);
  }
  return agent.playerAgent.askText(prompt, apiOpts);
}

// ---- 警长竞选发言 ----

export async function askSheriffSpeech(
  agent: AgentLike, day: number, context: string, isRunoff: boolean,
  options?: { thinking?: false; limit?: number }
): Promise<string | null>;
export async function askSheriffSpeech(
  agent: AgentLike, day: number, context: string, isRunoff: boolean,
  options: { thinking: true; limit?: number }
): Promise<{ content: string; thinking: string } | null>;
export async function askSheriffSpeech(
  agent: AgentLike,
  day: number,
  context: string,
  isRunoff: boolean,
  options: { thinking?: boolean; limit?: number } = {}
): Promise<string | { content: string; thinking: string } | null> {
  const title = isRunoff ? '警长竞选复发言' : '警上竞选发言';
  const limit = options.limit ?? WEREWOLF.SHERIFF_SPEECH_CHAR_LIMIT;
  const prompt = [
    `第${day}天${title}。`,
    `公开赛况：\n${context || '暂无公开信息。'}`,
    `你的身份：${getRoleLabel(agent as Record<string, unknown>)}。请发表警长竞选发言，建议不超过 ${limit} 字。`
  ].join('\n\n');
  const apiOpts = { maxTokens: Math.ceil(limit * 2.5), limit };

  if (options.thinking) {
    return agent.playerAgent.askTextWithThinking(prompt, apiOpts);
  }
  return agent.playerAgent.askText(prompt, apiOpts);
}

export type { WolfSpeech };
