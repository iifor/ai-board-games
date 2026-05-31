import crypto from 'crypto';
import type { ActionWindowSnapshot, DomainAction } from '@ai-presenter/shared/types/gameEngine';
import { EngineSkillRegistry } from '../skill/skillRegistry';

interface RunAgentActionInput {
  matchId: string;
  actionWindow: ActionWindowSnapshot;
  actorId: string | number;
  actionType?: string;
  skillId?: string;
  registry: EngineSkillRegistry;
  context?: Record<string, unknown>;
  idempotencyKey?: string;
}

class AgentRuntime {
  async runAction(input: RunAgentActionInput): Promise<DomainAction> {
    assertWindowAllowsActor(input.actionWindow, input.actorId);
    const actionType = input.actionType || input.actionWindow.actionType;
    const skillId = input.skillId || actionType;
    const result = await input.registry.execute(skillId, {
      ...(input.context || {}),
      matchId: input.matchId,
      actorId: input.actorId,
      actionType,
      actionWindow: input.actionWindow,
    });

    const payload = normalizeSkillOutput(result);
    return {
      id: createRuntimeId('action'),
      matchId: input.matchId,
      windowId: input.actionWindow.id,
      actorId: input.actorId,
      actionType,
      payload,
      idempotencyKey: input.idempotencyKey || `${input.actionWindow.id}:${input.actorId}:${actionType}`,
      submittedAt: new Date().toISOString(),
    };
  }
}

function assertWindowAllowsActor(window: ActionWindowSnapshot, actorId: string | number): void {
  if (window.status !== 'open') throw new Error(`ActionWindow is not open: ${window.id}`);
  if (window.actorIds.length && !window.actorIds.some((id) => String(id) === String(actorId))) {
    throw new Error(`Actor is not allowed in ActionWindow: ${actorId}`);
  }
}

function normalizeSkillOutput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Agent skill output must be a structured object.');
  }
  return value as Record<string, unknown>;
}

function createRuntimeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

export { AgentRuntime };
export type { RunAgentActionInput };
