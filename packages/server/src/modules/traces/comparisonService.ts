import type { PromptComparisonContext, PromptComparisonInput, TraceModelSettings } from '@battle/shared';
import { badRequest } from '../../utils/errors';
import { runPromptTrials, trialSettings, type TrialDependencies } from './promptTrials';
import type { comparisonRepository } from './comparisonRepository';
import { identityParts, ORIGINAL_TASK, renderTask, withPersona } from './promptVersions';

interface Dependencies extends TrialDependencies {
  repository: ReturnType<typeof comparisonRepository>;
}

export function comparisonService(deps: Dependencies) {
  const { repository, models } = deps;
  return {
    async context(matchId: string, requestId: string): Promise<PromptComparisonContext> {
      const { request, persona, name, gameKey, variantKey } = await repository.source(matchId, requestId);
      return { ...identityParts(request.prompt.identity, persona), instruction: request.prompt.instruction,
        ...(name && { template: { name, gameKey, variantKey, source: request.taskTemplate?.applied?.source ?? request.taskTemplate?.source ?? ORIGINAL_TASK },
          activeComparisonId: await repository.active(gameKey, variantKey, name) }),
        history: await repository.history(matchId, requestId) };
    },
    publish: repository.publish,
    async run(matchId: string, requestId: string, draft: PromptComparisonInput) {
      const { request, persona, name, gameKey, variantKey } = await repository.source(matchId, requestId);
      const { fixedIdentity } = identityParts(request.prompt.identity, persona);
      const identity = withPersona(fixedIdentity, draft.persona);
      let instruction = draft.instruction;
      if (draft.taskTemplate !== undefined) {
        if (!name) throw badRequest('本请求未采集任务模板标识');
        try { instruction = renderTask(draft.taskTemplate, request); }
        catch (error) { throw badRequest(error instanceof Error ? error.message : '模板无法在此请求的上下文中渲染'); }
        if (!instruction || instruction.length > 32000) throw badRequest('模板渲染后的任务须为 1 至 32000 字');
      }
      if (identity === request.prompt.identity && instruction === request.prompt.instruction &&
          (!draft.taskTemplate || draft.taskTemplate === (request.taskTemplate?.applied?.source ?? request.taskTemplate?.source ?? ORIGINAL_TASK))) {
        throw badRequest('请先修改人设或当前任务');
      }
      let settings: TraceModelSettings;
      if ('callId' in draft.model) {
        settings = await repository.callSettings(matchId, requestId, draft.model.callId);
      } else {
        settings = await trialSettings(models, draft.model.modelId, request, persona);
      }
      const { original, modified } = await runPromptTrials(deps, settings, request, { ...request.prompt, identity, instruction });
      const personaOverride = draft.persona === persona ? request.taskTemplate?.applied?.persona ?? null : draft.persona;
      return repository.save(matchId, requestId, { draft: { ...draft, instruction }, settings, original, modified,
        ...(name && draft.taskTemplate !== undefined && { publication: { gameKey, variantKey, templateName: name, source: draft.taskTemplate, persona: personaOverride } }) });
    },
  };
}

export type ComparisonService = ReturnType<typeof comparisonService>;
