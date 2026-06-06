import { MATCH_STATUS } from '@ai-presenter/shared/types/workflowTypes';
import { withStatePatch } from './projection';
import type { EventInput } from './repository';
import type { StepHandlerExecuteResult } from './workflowRegistry';

interface StateTransitionInput {
  matchId: string;
  stepId: string;
  matchVersion: number;
  currentStepIndex: number;
  previousState: Record<string, unknown>;
  nextState: Record<string, unknown>;
  result: StepHandlerExecuteResult;
}

function buildStateTransitionEvents(input: StateTransitionInput): EventInput[] {
  const projection = {
    currentStepIndex:
      input.result.status === 'WAITING'
        ? input.currentStepIndex
        : input.currentStepIndex + 1,
    status:
      input.result.status === 'WAITING'
        ? MATCH_STATUS.WAITING
        : MATCH_STATUS.RUNNING,
  };
  const events = (input.result.events || []).map((event, index) => ({
    stepId: input.stepId,
    ...(index === 0
      ? withStatePatch(event, input.previousState, input.nextState, projection)
      : event),
  })) as EventInput[];
  if (events.length) return events;

  const stateEvent = withStatePatch(
    {
      type: 'workflow_state_patched',
      visibility: 'system',
      idempotencyKey: `${input.matchId}:${input.stepId}:state-patch:${input.matchVersion}`,
      payload: {},
    },
    input.previousState,
    input.nextState,
    projection,
  ) as EventInput;
  const payload = stateEvent.payload as { statePatch?: unknown };
  return payload.statePatch ? [{ stepId: input.stepId, ...stateEvent }] : [];
}

export { buildStateTransitionEvents };
