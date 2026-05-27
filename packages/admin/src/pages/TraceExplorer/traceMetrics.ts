import type { LlmCall, TokenSummary } from '../../types/trace';

interface ModelTokenSummary {
  model: string;
  provider: string;
  callCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface FullTokenSummary extends TokenSummary {
  byModel: ModelTokenSummary[];
}

function getTraceTokenSummary(llmCalls: LlmCall[] = []): FullTokenSummary {
  const modelMap = new Map<string, ModelTokenSummary>();
  const totals = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  for (const call of llmCalls) {
    const promptTokens = Number(call?.prompt_tokens) || 0;
    const completionTokens = Number(call?.completion_tokens) || 0;
    const total = promptTokens + completionTokens;

    totals.promptTokens += promptTokens;
    totals.completionTokens += completionTokens;
    totals.totalTokens += total;

    const key = `${call.provider || 'unknown'}:${call.model || 'unknown'}`;
    let entry = modelMap.get(key);
    if (!entry) {
      entry = { model: call.model || 'unknown', provider: call.provider || 'unknown', callCount: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 };
      modelMap.set(key, entry);
    }
    entry.callCount += 1;
    entry.promptTokens += promptTokens;
    entry.completionTokens += completionTokens;
    entry.totalTokens += total;
  }

  const byModel = [...modelMap.values()].sort((a, b) => b.totalTokens - a.totalTokens);
  return { ...totals, byModel };
}

function formatTokenCount(value: number | undefined): string {
  return Number(value || 0).toLocaleString();
}

export { getTraceTokenSummary, formatTokenCount };
export type { FullTokenSummary, ModelTokenSummary };
