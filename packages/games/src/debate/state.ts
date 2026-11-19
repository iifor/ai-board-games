import { z } from 'zod';

export const topicSchema = z.object({
  title: z.string().trim().min(1).max(100),
  pro: z.string().trim().min(1).max(200),
  con: z.string().trim().min(1).max(200),
});

export const debateParamsSchema = z.object({
  /** 不指定时按种子从题库抽取 */
  topic: topicSchema.optional(),
});

const sideBudget = z.object({
  remaining: z.number().int().nonnegative(),
  turns: z.array(z.number().int()),
  failedSeats: z.array(z.number().int()),
  recommendation: z.number().int().nullable(),
});
export const freeDebateSchema = z.object({
  pro: sideBudget, con: sideBudget,
  next: z.enum(['pro', 'con']),
  questionTo: z.number().int().nullable(),
  questionText: z.string().nullable().optional(),
  lastPass: z.enum(['pro', 'con']).nullable(),
  finished: z.boolean(),
});
export type FreeDebate = z.infer<typeof freeDebateSchema>;

export const debateStateSchema = z.object({
  topic: topicSchema,
  freeDebate: freeDebateSchema.optional(),
});

export type DebateTopic = z.infer<typeof topicSchema>;
export type DebateParams = z.infer<typeof debateParamsSchema>;
export type DebateState = z.infer<typeof debateStateSchema>;

export const DEBATE_SIDES = { pro: '正方', con: '反方' } as const;
export type DebateSide = keyof typeof DEBATE_SIDES;
