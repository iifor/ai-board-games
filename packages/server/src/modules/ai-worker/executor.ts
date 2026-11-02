import { chaosReply, scriptedOutput, toChatMessages, type CompiledGame, type EngineInput } from '@battle/engine';
import { logger } from '../../utils/logger';
import { extractJson, LlmError, type LlmClient } from '../llm';
import type { MatchRepository } from '../matches/repository';
import type { TaskCompletion } from '../matches/types';
import type { ModelService } from '../models/service';
import type { ProviderService } from '../providers/service';
import type { AiTaskRepository, ClaimedTask, SeatModel } from './repository';

export const LLM_TIMEOUT_MS = 60_000;
/** 每个模型的传输层尝试次数；主模型用尽后切换备用模型 */
export const ATTEMPTS_PER_MODEL = 2;

export interface TaskResult {
  readonly input: EngineInput;
  readonly completion: TaskCompletion;
}

export interface ExecutorDeps {
  readonly tasks: AiTaskRepository;
  readonly matches: MatchRepository;
  readonly providers: ProviderService;
  readonly models: Pick<ModelService, 'markQuotaExhausted'>;
  readonly llm: LlmClient;
  readonly findGame: (key: string) => CompiledGame;
  readonly sleep: (ms: number) => Promise<void>;
}

function succeeded(task: ClaimedTask, output: unknown): TaskResult {
  return {
    input: { kind: 'ai_result', requestId: task.requestId, output },
    completion: { requestId: task.requestId, status: 'succeeded', output, error: null },
  };
}

function failed(task: ClaimedTask, reason: string): TaskResult {
  return {
    input: { kind: 'ai_failed', requestId: task.requestId, reason },
    completion: { requestId: task.requestId, status: 'failed', output: null, error: reason },
  };
}

export function createTaskExecutor(deps: ExecutorDeps) {
  async function callModel(task: ClaimedTask, model: SeatModel): Promise<{ output: unknown } | { error: string; retryable: boolean }> {
    const started = Date.now();
    const base = { matchId: task.matchId, requestId: task.requestId, seat: task.seat, modelId: model.modelId, modelName: model.name, prompt: task.request.prompt };
    try {
      const credentials = await deps.providers.credentials(model.providerId);
      const response = await deps.llm.complete({
        baseUrl: credentials.baseUrl,
        apiKey: credentials.apiKey,
        model: model.model,
        messages: toChatMessages(task.request.prompt),
        temperature: model.temperature,
        maxTokens: model.maxTokens,
        timeoutMs: LLM_TIMEOUT_MS,
      });
      const output = extractJson(response.content);
      await deps.tasks.recordCall({ ...base, rawResponse: response.content, output, error: null, latencyMs: Date.now() - started, usage: response.usage });
      return { output };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await deps.tasks.recordCall({ ...base, rawResponse: null, output: undefined, error: message, latencyMs: Date.now() - started, usage: null });
      const quotaExhausted = error instanceof LlmError && error.quotaExhausted;
      if (quotaExhausted) {
        await deps.models.markQuotaExhausted(model.modelId);
        logger.warn('模型额度耗尽，已自动停用', { modelId: model.modelId, modelName: model.name, error: message });
      }
      return { error: message, retryable: !quotaExhausted && error instanceof LlmError && error.retryable };
    }
  }

  /** 主模型与备用模型中仍启用的部分；主模型被停用（如额度耗尽）时直接用备用模型 */
  async function modelChain(task: ClaimedTask): Promise<SeatModel[]> {
    const primary = await deps.tasks.seatModel(task.matchId, task.seat);
    if (!primary) return [];
    const fallback = primary.fallbackModelId ? await deps.tasks.modelById(primary.fallbackModelId) : undefined;
    return [primary, ...(fallback ? [fallback] : [])].filter((model) => model.enabled);
  }

  return {
    /** 执行一个任务：脚本化对局直接给出确定性输出（混沌脚本可能模拟一次调用失败）；否则依次尝试主模型与备用模型 */
    async execute(task: ClaimedTask): Promise<TaskResult> {
      const match = await deps.matches.find(task.matchId);
      if (!match) return failed(task, '对局不存在');
      if (match.scripted) {
        const game = deps.findGame(match.gameKey);
        const snapshot = await deps.matches.snapshot(task.matchId);
        if (!snapshot) return failed(task, '对局不存在');
        if (!match.chaos) return succeeded(task, scriptedOutput(game, snapshot, task.request));
        // 模拟的调用失败是一次"已完成但失败"的任务：以 ai_failed 交回引擎走兜底，对局继续；
        // 它不是执行异常，不会计入 worker 的领取次数上限
        const reply = chaosReply(game, snapshot, task.request);
        return 'failed' in reply ? failed(task, reply.failed) : succeeded(task, reply.output);
      }

      const chain = await modelChain(task);
      if (!chain.length) return failed(task, '座位没有可用的模型');
      let lastError = '模型调用失败';
      for (const model of chain) {
        for (let attempt = 1; attempt <= ATTEMPTS_PER_MODEL; attempt += 1) {
          const result = await callModel(task, model);
          if ('output' in result) return succeeded(task, result.output);
          lastError = result.error;
          if (!result.retryable) break;
          if (attempt < ATTEMPTS_PER_MODEL) await deps.sleep(500 * attempt);
        }
      }
      return failed(task, lastError);
    },
  };
}

export type TaskExecutor = ReturnType<typeof createTaskExecutor>;
