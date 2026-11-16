import type { AccessCodeInput, AccessSessionRequest } from '@battle/shared';
import { z } from 'zod';

export const accessCodeInputSchema = z.object({
  username: z.string().trim().min(1, '请填写用户名').max(32),
  expiresAt: z.iso.datetime({ offset: true }),
  maxMatches: z.number().int().min(1).max(100_000).nullable(),
  disabled: z.boolean().optional(),
}) satisfies z.ZodType<AccessCodeInput>;

export const accessSessionSchema = z.object({
  code: z.string().trim().min(1, '请输入身份码').max(64),
}) satisfies z.ZodType<AccessSessionRequest>;
