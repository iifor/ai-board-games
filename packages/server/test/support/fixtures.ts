import { LlmError, type LlmClient, type LlmRequest } from '../../src/modules/llm';
import type { TtsProvider } from '../../src/modules/tts';
import type { TestApp } from './testApp';

/** 读懂引擎的输出契约，给出一份对所有动作都合法的回答 */
export function answerFor(request: LlmRequest): string {
  const user = request.messages[request.messages.length - 1]?.content ?? '';
  const legal = /合法目标座位号：([\d、]+)/.exec(user)?.[1]?.split('、').map(Number) ?? [];
  const target = legal[0] ?? 1;
  return JSON.stringify({ speech: `我是${request.model}，这是我的发言。`, verdict: 'pro', comment: '论证清晰。', target, targets: [target] });
}

export function scriptedLlm(): LlmClient & { calls: LlmRequest[] } {
  const calls: LlmRequest[] = [];
  return {
    calls,
    complete: async (request) => {
      calls.push(request);
      return { content: answerFor(request), usage: { promptTokens: 10, completionTokens: 5 } };
    },
  };
}

/** 指定模型名一直失败（可重试），其余模型正常回答 */
export function failingLlm(failingModels: readonly string[]): LlmClient & { calls: LlmRequest[] } {
  const calls: LlmRequest[] = [];
  return {
    calls,
    complete: async (request) => {
      calls.push(request);
      if (failingModels.includes(request.model)) throw new LlmError('模型返回 503：busy', true);
      return { content: answerFor(request), usage: null };
    },
  };
}

/** 指定模型名返回"额度耗尽"（不可重试，且应停用模型），其余模型正常回答 */
export function quotaExhaustedLlm(exhaustedModels: readonly string[]): LlmClient & { calls: LlmRequest[] } {
  const calls: LlmRequest[] = [];
  return {
    calls,
    complete: async (request) => {
      calls.push(request);
      if (exhaustedModels.includes(request.model)) throw new LlmError('模型返回 429：Arrearage', false, true);
      return { content: answerFor(request), usage: null };
    },
  };
}

export function fakeTts(): TtsProvider & { texts: string[] } {
  const texts: string[] = [];
  return {
    texts,
    synthesize: async (text) => {
      texts.push(text);
      return { data: Buffer.from(`audio:${text}`), mime: 'audio/mpeg' };
    },
  };
}

let seedCounter = 0;

/** 建好供应商、主/备模型、音色与 count 名玩家，返回玩家 ID */
export async function seedPlayers(t: TestApp, count: number, options: { primary?: string; fallback?: string } = {}): Promise<number[]> {
  seedCounter += 1;
  const provider = await t.services.providers.create({ name: `供应商-${seedCounter}`, baseUrl: 'https://llm.example.com/v1', apiKey: 'sk-test' });
  const fallback = await t.services.models.create({ providerId: provider.id, name: `备用-${provider.id}`, model: options.fallback ?? 'backup-model' });
  const primary = await t.services.models.create({
    providerId: provider.id,
    name: `主模型-${provider.id}`,
    model: options.primary ?? 'main-model',
    fallbackModelId: fallback.id,
  });
  const voice = await t.services.voices.create({ name: `音色-${provider.id}`, provider: 'azure', voiceName: 'zh-CN-Test' });
  const ids: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const player = await t.services.players.create({ name: `玩家${provider.id}-${index + 1}`, modelId: primary.id, voiceId: voice.id });
    ids.push(player.id);
  }
  return ids;
}

export async function runUntilSettled(t: TestApp, matchId: string, maxRounds = 200): Promise<void> {
  for (let round = 0; round < maxRounds; round += 1) {
    await t.services.worker.idle();
    const match = await t.services.repositories.matches.find(matchId);
    if (!match || match.status === 'completed' || match.status === 'failed' || match.status === 'paused') return;
  }
  throw new Error(`对局 ${matchId} 没有在预期内结束`);
}
