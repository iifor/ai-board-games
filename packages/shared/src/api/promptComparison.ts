import type { TraceModelSettings } from './traces';

export type ComparisonModel = { readonly callId: number } | { readonly modelId: number };

export interface PromptComparisonInput {
  readonly persona: string;
  readonly instruction: string;
  /** 可复用任务模板；instruction 保留本次渲染文本。 */
  readonly taskTemplate?: string | undefined;
  readonly model: ComparisonModel;
}

export interface PromptTrial {
  readonly raw: string | null;
  readonly error: string | null;
  readonly issues: readonly string[];
  readonly latencyMs: number;
  readonly usage: { readonly promptTokens: number; readonly completionTokens: number } | null;
}

export interface PromptComparisonRecord {
  readonly publication?: {
    readonly gameKey: string; readonly variantKey: string | null; readonly templateName: string;
    readonly source: string; readonly persona: string | null;
  };
  readonly id: number;
  readonly createdAt: string;
  readonly draft: PromptComparisonInput;
  readonly settings: TraceModelSettings;
  readonly original: PromptTrial;
  readonly modified: PromptTrial;
}

export interface PromptComparisonContext {
  readonly template?: { readonly name: string; readonly source: string; readonly gameKey: string; readonly variantKey: string | null };
  readonly activeComparisonId?: number | null;
  readonly persona: string;
  readonly fixedIdentity: string;
  readonly instruction: string;
  readonly history: readonly PromptComparisonRecord[];
}
