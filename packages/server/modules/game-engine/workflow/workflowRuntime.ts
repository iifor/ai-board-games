import {
  createWorkflowMatch,
  getDebugState,
  submitPendingAction,
  wakeTick,
} from '../../workflow-engine/service';
import type { Match } from '../../../types/workflow';

interface CreateRuntimeMatchInput {
  workflowId: string;
  gameType: string;
  config?: Record<string, unknown>;
  initialState?: Record<string, unknown>;
  matchId?: string;
}

class WorkflowRuntime {
  createMatch(input: CreateRuntimeMatchInput): Match {
    return createWorkflowMatch(input);
  }

  tick(matchId: string): Match {
    return wakeTick(matchId);
  }

  submitPendingAction(input: {
    matchId: string;
    actionId: string;
    payload?: Record<string, unknown>;
    idempotencyKey?: string;
  }): Match {
    return submitPendingAction(input);
  }

  getDebugState(matchId: string): unknown {
    return getDebugState(matchId);
  }
}

export { WorkflowRuntime };
export type { CreateRuntimeMatchInput };
