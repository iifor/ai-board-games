import { z } from 'zod';

export class ConfigTransferError extends Error {}

const id = z.number().int().positive().max(2_147_483_646);
const text = z.string();
const order = z.string().regex(/^[1-9]\d*$/).pipe(
  z.string().refine(v => BigInt(v) < 9_223_372_036_854_775_807n, '发布顺序超出范围'),
);
const temperature = z.number().min(0).max(2).nullable();
const tokens = z.number().int().min(16).max(32000);
const provider = z.object({
  id, name: text.min(1), baseUrl: z.url(), apiKeyEncrypted: text.min(1), apiKeyHint: text,
  enabled: z.boolean(),
});
const model = z.object({
  id, providerId: id, name: text.min(1), model: text.min(1), temperature, maxTokens: tokens,
  fallbackModelId: id.nullable(), enabled: z.boolean(), disabledReason: text.nullable(),
  disabledAt: z.iso.datetime().nullable(),
});
const voice = z.object({
  id, name: text.min(1), provider: text.min(1), voiceName: text.min(1), language: text, gender: text.nullable(),
  style: text, rate: text, pitch: text, sampleText: text, description: text, enabled: z.boolean(),
});
const player = z.object({
  id, name: text.nullable(), appearanceName: text.nullable(), avatar: text.nullable(), persona: text,
  temperature, maxTokens: tokens.nullable(), speechMaxChars: z.number().int().positive().max(500).nullable(),
  modelId: id.nullable(), voiceId: id.nullable(), enabled: z.boolean(),
});
const template = z.object({ gameKey: text.min(1), templateName: text.min(1), source: text, revision: id, publicationOrder: order });
const applied = z.object({ gameKey: text.min(1), variantKey: text, templateName: text.min(1),
  source: text, persona: text.nullable(), publicationOrder: order });
const announcement = z.object({ gameKey: text.min(1), key: text.min(1), customText: text.nullable(), revision: id });

/** 逐表白名单，数据库新增字段不会自动进入迁移包。 */
export const configBundleSchema = z.object({
  format: z.literal('at-odds-config'), version: z.literal(1), exportedAt: z.iso.datetime(),
  providers: z.array(provider), models: z.array(model), voices: z.array(voice), players: z.array(player),
  templates: z.array(template), applied: z.array(applied), announcements: z.array(announcement),
}).strict().superRefine((data, ctx) => {
  for (const key of ['providers', 'models', 'voices', 'players'] as const) {
    const ids = data[key].map(row => row.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', path: [key], message: 'ID 重复' });
  }
  const providers = new Set(data.providers.map(p => p.id));
  const models = new Set(data.models.map(m => m.id));
  const voices = new Set(data.voices.map(v => v.id));
  data.models.forEach((m, i) => {
    if (!providers.has(m.providerId)) ctx.addIssue({ code: 'custom', path: ['models', i, 'providerId'], message: '供应商不存在' });
    if (m.fallbackModelId !== null && !models.has(m.fallbackModelId)) {
      ctx.addIssue({ code: 'custom', path: ['models', i, 'fallbackModelId'], message: '备用模型不存在' });
    }
  });
  data.players.forEach((p, i) => {
    if (p.modelId !== null && !models.has(p.modelId)) ctx.addIssue({ code: 'custom', path: ['players', i, 'modelId'], message: '模型不存在' });
    if (p.voiceId !== null && !voices.has(p.voiceId)) ctx.addIssue({ code: 'custom', path: ['players', i, 'voiceId'], message: '音色不存在' });
  });
});

export type ConfigBundle = z.infer<typeof configBundleSchema>;
