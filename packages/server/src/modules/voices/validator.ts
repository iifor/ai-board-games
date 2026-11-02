import { VOICE_GENDERS, VOICE_PROVIDERS, type VoiceInput, type VoicePreviewRequest } from '@battle/shared';
import { z } from 'zod';

const percent = z.string().trim().max(8).regex(/^[+-]?\d+(\.\d+)?%$/, '请填写百分比，如 0%、+10%、-10%');

export const voiceSchema = z.object({
  name: z.string().trim().min(1).max(64),
  provider: z.enum(VOICE_PROVIDERS),
  voiceName: z.string().trim().min(1).max(128),
  language: z.string().trim().min(2).max(16).optional(),
  gender: z.enum(VOICE_GENDERS).nullable().optional(),
  style: z.string().trim().max(200).optional(),
  rate: percent.optional(),
  pitch: percent.optional(),
  sampleText: z.string().trim().max(200).optional(),
  description: z.string().trim().max(500).optional(),
  enabled: z.boolean().optional(),
}) satisfies z.ZodType<VoiceInput>;

export const voicePreviewSchema = z.object({
  text: z.string().trim().min(1).max(200).optional(),
}) satisfies z.ZodType<VoicePreviewRequest>;
