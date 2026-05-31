import { z } from 'zod';

const recordSchema = z.record(z.string(), z.unknown());
const actorIdSchema = z.union([z.string().min(1), z.number()]);
const engineChannelSchema = z.enum(['public', 'audience', 'scope', 'system']);

const domainActionSchema = z.object({
  id: z.string().min(1),
  matchId: z.string().min(1),
  windowId: z.string().min(1),
  actorId: actorIdSchema,
  actionType: z.string().min(1),
  payload: recordSchema.default({}),
  idempotencyKey: z.string().min(1),
  traceId: z.string().optional(),
  causationId: z.string().optional(),
  correlationId: z.string().optional(),
  submittedAt: z.string().optional(),
});

const workflowEffectSchema = z.object({
  id: z.string().min(1),
  matchId: z.string().min(1),
  effectType: z.string().min(1),
  status: z.enum(['proposed', 'applied', 'cancelled', 'failed']).default('proposed'),
  payload: recordSchema.default({}),
  priority: z.number().optional(),
  stepId: z.string().optional(),
  sourceActionId: z.string().optional(),
  sourceEventSeq: z.number().optional(),
  appliedEventSeq: z.number().optional(),
  traceId: z.string().optional(),
  causationId: z.string().optional(),
  correlationId: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

const domainEventSchema = z.object({
  id: z.string().min(1),
  matchId: z.string().min(1),
  type: z.string().min(1),
  payload: recordSchema.default({}),
  channel: engineChannelSchema,
  scopeKey: z.string().optional(),
  seq: z.number().optional(),
  stepId: z.string().optional(),
  actorId: actorIdSchema.optional(),
  traceId: z.string().optional(),
  causationId: z.string().optional(),
  correlationId: z.string().optional(),
  idempotencyKey: z.string().optional(),
  createdAt: z.string().optional(),
}).superRefine((event, ctx) => {
  if (event.channel === 'scope' && !event.scopeKey) {
    ctx.addIssue({
      code: 'custom',
      path: ['scopeKey'],
      message: 'scope events require scopeKey',
    });
  }
});

const gameDefinitionSchema = z.object({
  gameType: z.string().min(1),
  version: z.string().min(1),
  workflowId: z.string().min(1),
  skills: z.array(z.object({
    id: z.string().min(1),
    inputSchema: z.unknown().optional(),
    outputSchema: z.unknown().optional(),
    timeoutMs: z.number().positive().optional(),
    retryPolicy: recordSchema.optional(),
    fallbackPolicy: recordSchema.optional(),
    visibility: engineChannelSchema.optional(),
  })).optional(),
  actionSchemas: z.record(z.string(), z.unknown()).optional(),
  createEffectsFromAction: z.function().optional(),
  effectResolvers: z.array(z.object({
    effectType: z.string().min(1),
    resolve: z.function(),
  })).optional(),
  channelPolicy: z.object({
    canAccess: z.function().optional(),
    matchScope: z.function().optional(),
  }).optional(),
  metadata: recordSchema.optional(),
});

export {
  actorIdSchema,
  engineChannelSchema,
  domainActionSchema,
  workflowEffectSchema,
  domainEventSchema,
  gameDefinitionSchema,
};
