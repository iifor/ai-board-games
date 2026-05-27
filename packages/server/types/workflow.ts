// Workflow engine entity types — camelCase, produced by rowTo* mappers.

interface Match {
  id: string;
  gameType: string;
  workflowId: string;
  status: string;
  currentStepIndex: number;
  version: number;
  config: Record<string, unknown>;
  state: Record<string, unknown>;
  blockers: StepBlocker[];
  error: unknown;
  createdAt: string;
  updatedAt: string;
  completedAt: string | undefined;
}

interface StepBlocker {
  id: string;
  type: string;
  required: boolean;
  status: string;
  taskId?: string;
  actionId?: string;
  playerId?: string | number;
  reason?: string;
}

interface WorkflowEvent {
  id: number;
  matchId: string;
  seq: number;
  type: string;
  stepId: string | undefined;
  playerId: string | undefined;
  payload: unknown;
  visibility: string;
  channel: string;
  scopeKey: string | undefined;
  visibleToPlayerIds: (string | number)[];
  idempotencyKey: string | undefined;
  createdAt: string;
}

interface AiTask {
  id: string;
  matchId: string;
  stepId: string;
  taskKey: string;
  epochId: string | undefined;
  playerId: string | undefined;
  action: string;
  status: string;
  prompt: unknown;
  promptContextSnapshot: unknown;
  rawOutput: string;
  result: unknown;
  error: unknown;
  attempts: number;
  workerId: string | undefined;
  claimedAt: string | undefined;
  visibleEventSeqMax: number;
  createdAt: string;
  updatedAt: string;
}

interface PendingAction {
  id: string;
  matchId: string;
  stepId: string;
  epochId: string | undefined;
  playerId: string | undefined;
  actorType: string;
  actionType: string;
  status: string;
  payload: unknown;
  resultEventSeq: number | undefined;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

interface MatchSnapshot {
  id: number;
  matchId: string;
  version: number;
  status: string;
  currentStepIndex: number;
  state: Record<string, unknown>;
  blockers: StepBlocker[];
  createdAt: string;
}

interface ActionWindowEpoch {
  id: string;
  matchId: string;
  stepId: string;
  actionType: string;
  status: string;
  window: Record<string, unknown>;
  createdEventSeq: number | undefined;
  resolvedEventSeq: number | undefined;
  expiresAt: string | undefined;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowEffect {
  id: string;
  matchId: string;
  stepId: string | undefined;
  sourceEventSeq: number | undefined;
  effectType: string;
  status: string;
  priority: number;
  payload: unknown;
  appliedEventSeq: number | undefined;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowInterrupt {
  id: string;
  matchId: string;
  stepId: string | undefined;
  effectId: string | undefined;
  interruptType: string;
  status: string;
  priority: number;
  payload: unknown;
  resolution: unknown;
  createdAt: string;
  updatedAt: string;
}

export type {
  Match,
  StepBlocker,
  WorkflowEvent,
  AiTask,
  PendingAction,
  MatchSnapshot,
  ActionWindowEpoch,
  WorkflowEffect,
  WorkflowInterrupt
};
