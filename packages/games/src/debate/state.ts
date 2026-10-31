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

export const debateStateSchema = z.object({
  topic: topicSchema,
});

export type DebateTopic = z.infer<typeof topicSchema>;
export type DebateParams = z.infer<typeof debateParamsSchema>;
export type DebateState = z.infer<typeof debateStateSchema>;

export const DEBATE_SIDES = { pro: '正方', con: '反方' } as const;
export type DebateSide = keyof typeof DEBATE_SIDES;
