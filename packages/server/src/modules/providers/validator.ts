import type { ProviderInput } from '@battle/shared';
import { z } from 'zod';

const base = {
  name: z.string().trim().min(1).max(64),
  baseUrl: z.url({ protocol: /^https?$/ }).max(500),
  enabled: z.boolean().optional(),
};

export const createProviderSchema = z.object({ ...base, apiKey: z.string().trim().min(1).max(500) }) satisfies z.ZodType<ProviderInput>;
export const updateProviderSchema = z.object({ ...base, apiKey: z.string().trim().min(1).max(500).optional() }) satisfies z.ZodType<ProviderInput>;
