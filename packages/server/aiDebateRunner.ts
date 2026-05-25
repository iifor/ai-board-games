import { runDebateWorkflow } from './modules/debate';
import { PHASES, PHASE_LIMITS } from './modules/debate/constants';

async function runAiDebate(config: Record<string, unknown>, options: Record<string, unknown> = {}): Promise<unknown> {
  return runDebateWorkflow(config as never, options);
}

export { runAiDebate, PHASES, PHASE_LIMITS };
