import { aiExecutorFor } from '../phases/registry';
import { templateByName, type RequestDraft } from '../phases/types';
import { assemblePrompt } from '../prompt/assemble';
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

  const pending: PendingRequest = {
    id: `${env.phaseId()}#${s.cursor.visit}:${draft.slot}:a${attempt}`,
    seat: draft.seat,
    phaseId: env.phaseId(),
    visit: s.cursor.visit,
    slot: draft.slot,
    action: draft.action,
    attempt,
    legalTargets: draft.legalTargets,
    vars: draft.vars,
    templateName: draft.template.name,
    previousError,
  };
  const outputSchema = toJsonSchema(aiExecutorFor(phase).schema(env, phase, pending));
  const prompt = assemblePrompt(env.game, s, {
    viewer: env.seat(draft.seat),
    instruction: draft.template,
    vars: draft.vars,
    legalTargets: draft.legalTargets,
    outputSchema,
    previousError,
  });

  s.pending.push(deepFreeze(cloneJson(pending)));
  s.budgetUsed.aiRequests += 1;
  env.out.aiRequests.push({
    id: pending.id,
    seat: pending.seat,
    phaseId: pending.phaseId,
    action: pending.action,
    attempt,
    prompt,
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
