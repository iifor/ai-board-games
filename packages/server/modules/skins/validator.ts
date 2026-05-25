import { z } from 'zod';

const createSkinSchema = z.object({
  name: z.string().min(1, '皮肤名称不能为空').max(200),
  background: z.string().min(1, '事件背景不能为空'),
  truth: z.string().min(1, '真相不能为空'),
  clues: z.array(z.object({ title: z.string(), text: z.string() })).min(1, '至少需要一条线索'),
  terms: z.object({}).optional(),
  noises: z.array(z.string()).optional(),
  memoryExamples: z.array(z.string()).optional(),
  version: z.string().optional(),
  source: z.string().optional(),
  enabled: z.boolean().optional(),
});

const updateSkinSchema = createSkinSchema.partial();

const importSkinJsonSchema = z.object({
  raw: z.string().optional(),
  name: z.string().optional(),
  background: z.string().optional(),
  truth: z.string().optional(),
  clues: z.array(z.unknown()).optional(),
  id: z.string().optional(),
});

export { createSkinSchema, updateSkinSchema, importSkinJsonSchema };
