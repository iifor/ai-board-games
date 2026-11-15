import { aiExecutorFor } from '../phases/registry';
import { templateByName, type RequestDraft } from '../phases/types';
import { assemblePrompt } from '../prompt/assemble';
import { recall, memoryHistory, memoryOutputSchema } from '../prompt/playerMemory';
import { budgetLimits } from '../runtime/budget';
import type { ExecEnv } from '../runtime/env';
import type { PendingRequest } from '../runtime/types';
import { cloneJson, deepFreeze } from '../utils/json';
import { toJsonSchema } from './outputContract';

/** 登记 pending 并渲染完整的 AiRequest；超出 AI 调用预算时返回 false */
export function issueRequest(env: ExecEnv, draft: RequestDraft, attempt = 1, previousError: string | null = null): boolean {
  const { s } = env;
  if (s.budgetUsed.aiRequests >= budgetLimits(env.game).maxAiRequests) return false;
  const phase = env.phase();
  const registered = env.game.prompts.get(draft.template.name);
  if (registered !== draft.template) throw new Error(`模板 "${draft.template.name}" 未登记在 spec.prompts 中`);

  const viewer = env.seat(draft.seat);
  const settings = viewer.profile.speechSettings;
  const vars = settings && (draft.action === 'speak' || draft.action === 'judge')
    ? { ...draft.vars, maxChars: settings.speechMaxChars }
    : draft.vars;
  const memoryContext = recall(s, viewer, draft.action);
  const pending: PendingRequest = {
    ...(memoryContext && { memoryContext }),
    id: `${env.phaseId()}#${s.cursor.visit}:${draft.slot}:a${attempt}`,
    seat: draft.seat,
    phaseId: env.phaseId(),
    visit: s.cursor.visit,
    slot: draft.slot,
    action: draft.action,
    attempt,
    legalTargets: draft.legalTargets,
    vars,
    templateName: draft.template.name,
    previousError,
  };
  const baseSchema = toJsonSchema(aiExecutorFor(phase).schema(env, phase, pending));
  const outputSchema = memoryContext ? memoryOutputSchema(baseSchema, memoryContext) : baseSchema;
  const { prompt, taskTemplate } = assemblePrompt(env.game, s, {
    action: draft.action,
    onFallback: name => env.record('failure', '已保存模板无法渲染，使用基础模板', { template: name }, { seat: draft.seat, requestIds: [pending.id] }),
    viewer,
    instruction: draft.template,
    vars,
    legalTargets: draft.legalTargets,
    outputSchema,
    previousError,
  });

  s.pending.push(deepFreeze(cloneJson(pending)));
  env.record('request', pending.action, { template: pending.templateName, previousError, previousRequestId: env.activeRequestId }, { seat: pending.seat, requestIds: [pending.id] });
  s.budgetUsed.aiRequests += 1;
  env.out.aiRequests.push({
    ...(memoryContext && { memoryContext }),
    ...(settings && { speechSettings: settings }),
    id: pending.id,
    seat: pending.seat,
    phaseId: pending.phaseId,
    action: pending.action,
    attempt,
    prompt: memoryContext ? { ...prompt, history: [prompt.history, memoryHistory(memoryContext, s.seats)].filter(Boolean).join('\n\n') } : prompt,
    taskTemplate,
    outputSchema,
    legalTargets: pending.legalTargets,
  });
  return true;
}

export function issueDrafts(env: ExecEnv, drafts: readonly RequestDraft[]): boolean {
  return drafts.every((draft) => issueRequest(env, draft));
}

export function draftFromPending(env: ExecEnv, pending: PendingRequest): RequestDraft {
  return {
    slot: pending.slot,
    seat: pending.seat,
    action: pending.action,
    template: templateByName(env, pending.templateName),
    vars: pending.vars,
    legalTargets: pending.legalTargets,
  };
}
