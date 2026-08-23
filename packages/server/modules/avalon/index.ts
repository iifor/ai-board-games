import { registerAvalonWorkflow } from './workflow';

registerAvalonWorkflow();

export {
  AVALON_WORKFLOW_ID,
  avalonWorkflow,
  createAvalonWorkflowMatch,
  registerAvalonWorkflow,
  runAvalonWorkflow,
} from './workflow';
export { AVALON_GAME_DEFINITION_VERSION, createAvalonGameDefinition } from './definition';
