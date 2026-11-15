import type { MemoryReviewCall } from '@battle/shared';
import { ZodError } from 'zod';
import { LlmError } from '../llm';
import { REVIEW_PROMPT } from './reflection';

export const OUTPUT_LIMIT = '模型输出预算耗尽';
type Attempt = Pick<MemoryReviewCall, 'status' | 'detail'>;

export function callFailure(error: unknown): string {
  if (!(error instanceof LlmError)) return '模型客户端异常';
  if (error.quotaExhausted) return '供应商额度耗尽';
  const httpStatus = /^模型返回 (\d{3})/.exec(error.message)?.[1];
  if (httpStatus) return `供应商 HTTP ${httpStatus}`;
  if (error.message.includes('超时')) return '模型调用超时';
  if (error.outputLimit) return OUTPUT_LIMIT;
  if (error.message.includes('空内容')) return '模型回复为空';
  return error.retryable ? '临时调用故障' : '模型调用失败';
}

export function validationFeedback(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues.slice(0, 8).map(issue => `${issue.path.join('.') || 'JSON 根对象'}：${issue.message}`).join('；');
  }
  return error instanceof Error ? error.message : 'JSON 根对象不符合记忆结构';
}

/** 调用日志属于单局单席；切到备用模型或任务重新领取时，延续已经获得的校验和截断反馈。 */
export function reviewRetryPlan(calls: readonly Attempt[], modelLimit: number) {
  const level = Math.min(2, calls.filter(c => c.status === 'call_failed' && c.detail === OUTPUT_LIMIT).length);
  const correction = calls.filter(c => c.status === 'invalid_reply').at(-1)?.detail;
  const instructions = [REVIEW_PROMPT];
  if (level) instructions.push('上次输出达到预算，请只写最有依据的一条短记忆，没有合适证据就返回空数组。');
  if (correction) instructions.push(`上一次回复的校验错误：${correction}。请按下方材料和字段要求重新输出完整 JSON。`);
  return { level, maxTokens: Math.min(modelLimit, 1600 * 2 ** level), prompt: instructions.join('\n') };
}
