import { createId, toJson } from './utils';
import * as repo from './repository';
import { WORKFLOW_EFFECT_STATUS, WORKFLOW_INTERRUPT_STATUS } from '@ai-presenter/shared/types/workflowTypes';
import type { WorkflowEffect, WorkflowInterrupt } from '../../types/workflow';
import type { DbExecutor } from '../../db/types';

interface RecordEffectsInput {
  matchId: string;
  stepId?: string | null;
  sourceEventSeq?: number | null;
  effects?: Array<Record<string, unknown>>;
  db?: DbExecutor;
}

interface InterruptInput {
  matchId: string;
  stepId?: string | null;
  effectId?: string | null;
  interruptType: string;
  priority?: number;
  payload?: Record<string, unknown>;
}

async function recordWorkflowEffects({ matchId, stepId = null, sourceEventSeq = null, effects = [], db }: RecordEffectsInput): Promise<WorkflowEffect[]> {
  const stored = await Promise.all(effects.map((effect, index) => repo.createWorkflowEffect({
    id: String(effect.id || createId('effect')),
    matchId,
    stepId,
    sourceEventSeq,
    effectType: String(effect.type || effect.effectType || 'unknown'),
    status: String(effect.status || WORKFLOW_EFFECT_STATUS.APPLIED),
    priority: Number(effect.priority || effects.length - index),
    payload: effect,
    appliedEventSeq: sourceEventSeq,
  }, db)));
  return stored.filter((item): item is WorkflowEffect => item !== null);
}

async function requestInterrupt(input: InterruptInput): Promise<WorkflowInterrupt> {
  const interrupt = await repo.createWorkflowInterrupt({
    id: createId('interrupt'),
    matchId: input.matchId,
    stepId: input.stepId || null,
    effectId: input.effectId || null,
    interruptType: input.interruptType,
    status: WORKFLOW_INTERRUPT_STATUS.PENDING,
    priority: input.priority || 0,
    payload: input.payload || {},
  });
  if (!interrupt) throw new Error('Failed to create workflow interrupt');
  await repo.commitWorkflowChange({
    matchId: input.matchId,
    events: [{
      stepId: input.stepId || undefined,
      type: 'workflow_interrupt_requested',
      payload: interrupt,
      visibility: 'system',
      idempotencyKey: `${interrupt.id}:requested`,
    }],
  });
  return interrupt;
}

async function resolveInterrupt(interruptId: string, status: string, resolution: unknown = {}): Promise<WorkflowInterrupt> {
  const interrupt = await repo.updateWorkflowInterrupt(interruptId, {
    status,
    resolution_json: toJson(resolution),
  });
  if (!interrupt) throw new Error(`Workflow interrupt not found: ${interruptId}`);
  await repo.commitWorkflowChange({
    matchId: interrupt.matchId,
    events: [{
      stepId: interrupt.stepId,
      type: 'workflow_interrupt_resolved',
      payload: interrupt,
      visibility: 'system',
      idempotencyKey: `${interrupt.id}:resolved:${status}`,
    }],
  });
  return interrupt;
}

export {
  recordWorkflowEffects,
  requestInterrupt,
  resolveInterrupt,
};
