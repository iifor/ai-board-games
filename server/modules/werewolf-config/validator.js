const { z } = require('zod');

const upsertRoleSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, '角色名称不能为空'),
  faction: z.enum(['good', 'wolves']).optional(),
  roleType: z.enum(['god', 'wolf', 'villager']).optional(),
  responsibility: z.string().optional(),
  ability: z.string().optional(),
  playStyleAdvice: z.string().optional(),
  keyInfo: z.string().optional(),
  rule: z.object({ actions: z.array(z.any()).optional() }).optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().optional()
});

const upsertModeSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, '模式名称不能为空'),
  description: z.string().optional(),
  roles: z.array(z.object({ roleId: z.string(), count: z.number() })).optional(),
  rules: z.object({}).optional(),
  sheriff: z.object({
    enabled: z.boolean().optional(),
    firstDayElection: z.boolean().optional(),
    voteWeight: z.number().optional()
  }).optional(),
  winCondition: z.enum(['side', 'single']).optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().optional()
});

module.exports = { upsertRoleSchema, upsertModeSchema };
