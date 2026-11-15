import { toChatMessages, type AiRequest, type PromptLayers } from '@battle/engine';
import { playerSpeechSettings, type PromptTrial, type TraceModelSettings } from '@battle/shared';
import { badRequest } from '../../utils/errors';
import { z } from 'zod';
import { LLM_TIMEOUT_MS } from '../ai-worker/executor';
import { extractJson, type LlmClient, type LlmRequest } from '../llm';
import type { ModelService } from '../models/service';
import type { ProviderService } from '../providers/service';

export interface TrialDependencies {
  llm: LlmClient;
  models: Pick<ModelService, 'get'>;
  providers: Pick<ProviderService, 'credentials'>;
}

export async function trialSettings(models: TrialDependencies['models'], modelId: number, request: AiRequest, persona = request.taskTemplate?.persona ?? ''): Promise<TraceModelSettings> {
  const model = await models.get(modelId);
  if (!model.enabled) throw badRequest('所选模型已停用');
  const player = request.speechSettings ?? playerSpeechSettings(persona);
  return { providerId: model.providerId, model: model.model, temperature: player.temperature, maxTokens: Math.min(model.maxTokens, player.maxTokens) };
}

function checkOutput(raw: string, schema: z.ZodType, request: AiRequest): string[] {
  const parsed = schema.safeParse(extractJson(raw));
  if (!parsed.success) return parsed.error.issues.map(issue => `${issue.path.join('.') || '输出'}：${issue.message}`);
  const value = parsed.data;
  if (!value || typeof value !== 'object' || !request.legalTargets) return [];
  const targets = 'targets' in value && Array.isArray(value.targets) ? value.targets
    : 'target' in value && typeof value.target === 'number' ? [value.target] : [];
  const issues: string[] = [];
  if (new Set(targets).size !== targets.length) issues.push('目标重复');
  if (targets.some(target => !request.legalTargets?.includes(target))) issues.push('目标超出历史合法座位范围');
  return issues;
}

export async function runPromptTrials({ llm, providers }: TrialDependencies, settings: TraceModelSettings,
  request: AiRequest, modifiedPrompt: PromptLayers) {
  const credentials = await providers.credentials(settings.providerId);
  const options: Omit<LlmRequest,'messages'> = { baseUrl: credentials.baseUrl, apiKey: credentials.apiKey,
    model: settings.model, temperature: settings.temperature, maxTokens: settings.maxTokens, timeoutMs: LLM_TIMEOUT_MS };
  const schema = z.fromJSONSchema(request.outputSchema);
  async function trial(prompt: PromptLayers): Promise<PromptTrial> {
    const start = Date.now();
    try {
      const reply = await llm.complete({ ...options, messages: toChatMessages(prompt) });
      return { raw: reply.content, error: null, usage: reply.usage, latencyMs: Date.now() - start,
        issues: checkOutput(reply.content, schema, request) };
    } catch {
      return { raw: null, error: '模型调用失败，请检查所选供应商、额度和连接状态。', usage: null, latencyMs: Date.now() - start, issues: [] };
    }
  }
  const original = await trial(request.prompt);
  const modified = await trial(modifiedPrompt);
  return { settings, original, modified };
}
