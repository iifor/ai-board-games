const { z } = require('zod');
const {
  MATCH_STATUS,
  BLOCKER_TYPES,
  BLOCKER_STATUS,
  AI_TASK_STATUS,
  PENDING_ACTION_STATUS,
  EVENT_VISIBILITY
} = require('../types/workflowTypes');

const jsonValueSchema = z.any();

const conditionSchema = z.lazy(() => z.union([
  z.boolean(),
  z.object({
    op: z.enum(['eq', 'ne', 'and', 'or', 'not', 'exists', 'gt', 'gte', 'lt', 'lte']),
    left: z.any().optional(),
    right: z.any().optional(),
    args: z.array(conditionSchema).optional()
  }),
  z.object({ var: z.string().min(1) })
]));

const stepBlockerSchema = z.object({
  id: z.string().min(1),
  type: z.enum(Object.values(BLOCKER_TYPES)),
  required: z.boolean().default(true),
  status: z.enum(Object.values(BLOCKER_STATUS)),
  taskId: z.string().optional(),
  actionId: z.string().optional(),
  playerId: z.union([z.string(), z.number()]).optional(),
  reason: z.string().optional()
});

const workflowStepSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  name: z.string().min(1),
  condition: conditionSchema.optional(),
  config: z.record(z.string(), jsonValueSchema).default({})
});

const workflowSchema = z.object({
  id: z.string().min(1),
  gameType: z.string().min(1),
  version: z.string().min(1),
  steps: z.array(workflowStepSchema).min(1)
});

const gameEventSchema = z.object({
  matchId: z.string().min(1),
  seq: z.number().int().positive(),
  type: z.string().min(1),
  stepId: z.string().optional(),
  playerId: z.union([z.string(), z.number()]).optional(),
  payload: jsonValueSchema.optional(),
  visibility: z.enum(Object.values(EVENT_VISIBILITY)).default(EVENT_VISIBILITY.PUBLIC),
  visibleToPlayerIds: z.array(z.union([z.string(), z.number()])).optional(),
  idempotencyKey: z.string().optional()
});

const aiTaskSchema = z.object({
  id: z.string().min(1),
  matchId: z.string().min(1),
  stepId: z.string().min(1),
  taskKey: z.string().min(1),
  playerId: z.union([z.string(), z.number()]).optional(),
  status: z.enum(Object.values(AI_TASK_STATUS)),
  prompt: jsonValueSchema.optional(),
  promptContextSnapshot: jsonValueSchema.optional(),
  visibleEventSeqMax: z.number().int().nonnegative().default(0),
  visibleEventIds: z.array(z.string()).default([])
});

const pendingActionSchema = z.object({
  id: z.string().min(1),
  matchId: z.string().min(1),
  stepId: z.string().min(1),
  playerId: z.union([z.string(), z.number()]).optional(),
  actorType: z.enum(['ai', 'human']),
  actionType: z.string().min(1),
  status: z.enum(Object.values(PENDING_ACTION_STATUS))
});

const matchSnapshotSchema = z.object({
  matchId: z.string().min(1),
  version: z.number().int().nonnegative(),
  status: z.enum(Object.values(MATCH_STATUS)),
  currentStepIndex: z.number().int().nonnegative(),
  state: jsonValueSchema,
  blockers: z.array(stepBlockerSchema).default([])
});

module.exports = {
  conditionSchema,
  stepBlockerSchema,
  workflowStepSchema,
  workflowSchema,
  gameEventSchema,
  aiTaskSchema,
  pendingActionSchema,
  matchSnapshotSchema
};
