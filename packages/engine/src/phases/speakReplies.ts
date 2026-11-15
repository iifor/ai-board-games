import { z, type ZodType } from 'zod';
import type { ExecEnv } from '../runtime/env';
import type { TemplateVars } from '../runtime/types';
import type { SpeakPhase } from '../spec/phases';

export interface TurnState {
  readonly seat: number;
  readonly vars: TemplateVars;
  readonly template: string;
  readonly followUp?: boolean;
}

const replyRequest = z.object({
  seat: z.number().int().positive(),
  task: z.string().trim().min(1).max(200).describe('请该队友确认的具体分工'),
});
export interface ReplyOutput { readonly replyRequests?: readonly z.infer<typeof replyRequest>[] | null }

export function replySeats(env: ExecEnv, phase: SpeakPhase<unknown, unknown>, turns: readonly TurnState[], index: number) {
  const speaker = turns[index]!;
  if (speaker.followUp) return [];
  const ctx = env.ctx();
  const channel = (seat: number) => phase.channel?.(ctx, env.seat(seat)) ?? 'public';
  const speakerChannel = channel(speaker.seat);
  return turns.filter(t => !t.followUp && t.seat !== speaker.seat && channel(t.seat) === speakerChannel).map(t => t.seat);
}

/** 附加字段填错时仍保留正文及其他合法点名。 */
export function withReplyRequests(schema: ZodType, eligible: readonly number[]): ZodType {
  if (!eligible.length) return schema;
  if (!(schema instanceof z.ZodObject)) throw new Error('定向回应需要对象形式的发言输出');
  return schema.extend({
    replyRequests: z.array(replyRequest.catch({ seat: 0, task: '' }).meta({ default: undefined })).nullish().catch([]).optional().describe(
      `仅在提出新战术且确实需要队友表态时填写座号和分工，可点名：${eligible.join('、')}。同意、仅改投票目标或无需配合时省略。`),
  });
}

export function scheduleReplies(turns: TurnState[], index: number, template: string, eligible: readonly number[],
  requests: NonNullable<ReplyOutput['replyRequests']>) {
  const speaker = turns[index]!;
  const seen = new Set<string>();
  const accepted: z.infer<typeof replyRequest>[] = [];
  for (const { seat, task } of requests) {
    const key = `${seat}:${task}`;
    if (!eligible.includes(seat) || seen.has(key)) continue;
    seen.add(key);
    accepted.push({ seat, task });
    let next = turns.findIndex((turn, i) => i > index && turn.seat === seat);
    if (next === -1) {
      const original = turns.find(turn => turn.seat === seat)!;
      next = turns.length;
      turns.push({ seat, template, followUp: true, vars: { maxChars: original.vars.maxChars!, replyTopics: '' } });
    }
    const turn = turns[next]!;
    const topic = `${speaker.seat}号请你确认：${task}`;
    const replyTopics = [turn.vars.replyTopics, topic].filter(Boolean).join('\n');
    turns[next] = { ...turn, vars: { ...turn.vars, replyTopics } };
  }
  return accepted;
}
