import { extractJson, LlmError, type LlmClient } from '../llm';
import type { AiTaskRepository } from '../ai-worker/repository';
import type { MatchRepository } from '../matches/repository';
import type { ProviderService } from '../providers/service';
import { logger } from '../../utils/logger';
import { compactReviewInput, interpretReview, reviewMaterial } from './reflection';
import { callFailure, OUTPUT_LIMIT, reviewRetryPlan, validationFeedback } from './reviewRetry';
import type { ReviewJob, reviewRepository } from './reviewRepository';

const PERMANENT_FAILURE = '不可重试：';

export function memoryWorker(repo: ReturnType<typeof reviewRepository>, deps: {
  matches: MatchRepository; tasks: AiTaskRepository; llm: LlmClient; providers: ProviderService;
}) {
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> | undefined;

  async function reflect(job: ReviewJob) {
    const snapshot = await deps.matches.snapshot(job.matchId);
    if (!snapshot) return;
    const notes = await repo.decisions(job);
    const initial = reviewMaterial(snapshot, job.ownerId, notes);
    if (!initial.evidence.length) return repo.finish(job, snapshot.gameKey, []);
    const primary = await deps.tasks.seatModel(job.matchId, job.seat);
    const fallback = primary?.fallbackModelId ? await deps.tasks.modelById(primary.fallbackModelId) : undefined;
    const models = [primary, fallback].filter(m => m?.enabled);
    let failure: unknown;
    for (const model of models) {
      if (!model) continue;
      const calls = await repo.attempts(job);
      if (calls.some(c => c.modelId === model.modelId && c.detail?.startsWith(PERMANENT_FAILURE))) continue;
      const plan = reviewRetryPlan(calls, model.maxTokens);
      const material = plan.level ? reviewMaterial(snapshot, job.ownerId, notes, plan.level) : { ...initial };
      const forgotten = await repo.forgottenIds(job.ownerId, material.previous.map(m => m.id));
      material.previous = material.previous.filter(m => !forgotten.has(m.id));
      try {
        const credentials = await deps.providers.credentials(model.providerId);
        const request = { ...credentials, model: model.model, temperature: 0.2,
          maxTokens: plan.maxTokens, timeoutMs: 45_000, messages: [
            { role: 'system', content: plan.prompt },
            { role: 'user', content: JSON.stringify(plan.level ? compactReviewInput(material) : material) },
          ] } as const;
        const id = await repo.beginCall(job, model, model.modelId !== primary?.modelId);
        if (id === null) return;
        const started = Date.now();
        const reply = await deps.llm.complete(request).catch(async error => {
          const permanent = error instanceof LlmError && !error.retryable && !error.outputLimit;
          const detail = (permanent ? PERMANENT_FAILURE : '') + callFailure(error);
          await repo.failedCall(id, 'call_failed', detail, Date.now() - started);
          throw error;
        });
        await repo.received(id, Date.now() - started, reply.usage);
        if (reply.truncated) {
          await repo.failedCall(id, 'call_failed', OUTPUT_LIMIT);
          throw new Error(OUTPUT_LIMIT);
        }
        let memories: ReturnType<typeof interpretReview>;
        try {
          memories = interpretReview(extractJson(reply.content), material);
        } catch (error) {
          const detail = validationFeedback(error);
          await repo.failedCall(id, 'invalid_reply', detail);
          throw error;
        }
        await repo.finish(job, snapshot.gameKey, memories, id).catch(async error => {
          await repo.failedCall(id, 'save_failed', '记忆保存事务失败');
          throw error;
        });
        return;
      } catch (error) {
        if (!(error instanceof LlmError && !error.retryable && !error.outputLimit)) failure = error;
      }
    }
    if (failure) throw failure;
    await repo.retry(job, true);
  }

  async function runOne() {
    const job = await repo.claim();
    if (!job) return false;
    try { await reflect(job); }
    catch (error) {
      logger.warn('赛后记忆复盘失败', { ...job, error: error instanceof Error ? error.message : '模型或数据库错误' });
      await repo.retry(job);
    }
    return true;
  }
  function tick() {
    if (running) return;
    running = (async () => { while (timer && await runOne()) { /* 成功领取后接着处理下一席 */ } })()
      .catch(error => logger.error('记忆任务领取失败', { error: String(error) })).finally(() => { running = undefined; });
  }
  return {
    runOne,
    start() { if (!timer) { timer = setInterval(tick, 2000); tick(); } },
    async stop() { clearInterval(timer); timer = undefined; await running; },
  };
}
