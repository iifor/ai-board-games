import { registerUndercoverWorkflow } from './workflow';

registerUndercoverWorkflow();

export {
  UNDERCOVER_WORKFLOW_ID,
  createUndercoverWorkflowMatch,
  registerUndercoverWorkflow,
  runUndercoverWorkflow,
} from './workflow';
export { UNDERCOVER_GAME_DEFINITION_VERSION, createUndercoverGameDefinition } from './definition';
