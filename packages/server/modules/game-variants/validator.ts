import { z } from 'zod';

const variantFields = {
  gameType: z.string().trim().min(1).max(80),
  variantKey: z.string().trim().min(1).max(80).regex(/^[a-z0-9][a-z0-9_-]*$/),
  definitionVersion: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).optional(),
  configSchemaVersion: z.number().int().positive().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
};

const createVariantSchema = z.object(variantFields).strict();
const updateVariantSchema = z.object({
  ...Object.fromEntries(Object.entries(variantFields).map(([key, schema]) => [key, schema.optional()])),
  revision: z.number().int().positive(),
}).strict();
const listVariantSchema = z.object({
  gameType: z.string().trim().min(1).optional(),
  includeDisabled: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
});
const idSchema = z.object({ id: z.coerce.number().int().positive() });

export { createVariantSchema, updateVariantSchema, listVariantSchema, idSchema };
