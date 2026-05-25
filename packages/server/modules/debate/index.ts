import { DEBATE, PHASE_LIMITS, PHASES, TOPICS } from './constants';
import type { DebatePhase, DebateTopic } from './constants';
import { registerDebateWorkflow, runDebateWorkflow } from './workflow';

registerDebateWorkflow();

export { DEBATE, PHASE_LIMITS, PHASES, TOPICS, registerDebateWorkflow, runDebateWorkflow };
export type { DebatePhase, DebateTopic };
