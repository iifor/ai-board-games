import type { AdminLoginRequest, ChangePasswordRequest } from '@battle/shared';
import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(32),
  password: z.string().min(1).max(128),
}) satisfies z.ZodType<AdminLoginRequest>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12, '新密码至少 12 个字符').max(128),
}) satisfies z.ZodType<ChangePasswordRequest>;
