import {
  createWorkflowMatch,
  drainAiTasks,
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

interface RunUntilBlockedOptions {
  batchSize?: number;
  workerId?: string;
}

class WorkflowRuntime {
  createMatch(input: CreateRuntimeMatchInput): Match {
    return createWorkflowMatch(input);
  }

  tick(matchId: string): Match {
    return wakeTick(matchId);
  }

  async runUntilBlocked(matchId: string, options: RunUntilBlockedOptions = {}): Promise<{ processed: number; match: Match | null }> {
    const batchSize = Math.max(1, Math.floor(options.batchSize || 100));
    let processed = 0;

    while (true) {
      const result = await drainAiTasks(matchId, { maxTasks: batchSize, workerId: options.workerId });
      processed += result.processed;
      if (!result.processed || !result.match || ['completed', 'failed', 'paused_debug'].includes(result.match.status)) {
        return { processed, match: result.match };
      }
    }
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
export type { CreateRuntimeMatchInput, RunUntilBlockedOptions };
