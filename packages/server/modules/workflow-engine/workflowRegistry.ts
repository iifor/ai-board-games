interface WorkflowStep {
  id: string;
  type: string;
  condition?: unknown;
  [key: string]: unknown;
}

interface Workflow {
  id: string;
  gameType?: string;
  steps: WorkflowStep[];
  [key: string]: unknown;
}

interface StepHandlerExecuteParams {
  match: Record<string, unknown>;
  workflow: Workflow;
  step: WorkflowStep;
  state: Record<string, unknown>;
}

interface StepHandlerExecuteResult {
  status: string;
  state?: Record<string, unknown>;
  events?: Array<Record<string, unknown>>;
  tasks?: Array<Record<string, unknown>>;
  pendingActions?: Array<Record<string, unknown>>;
  blockers?: Array<Record<string, unknown>>;
  matchStatus?: string;
  error?: Record<string, unknown>;
}

interface StepHandlerAiTaskParams {
  match: Record<string, unknown>;
  workflow: Workflow;
  step: WorkflowStep;
  task: Record<string, unknown>;
}

interface StepHandler {
  execute: (params: StepHandlerExecuteParams) => StepHandlerExecuteResult;
  runAiTask?: (params: StepHandlerAiTaskParams) => Promise<Record<string, unknown>>;
  validateAiResult?: (params: StepHandlerAiTaskParams & { result: Record<string, unknown> }) => void;
}

interface WorkflowEntry {
  workflow: Workflow;
  handlers: Record<string, StepHandler>;
}

const workflows = new Map<string, WorkflowEntry>();

function registerWorkflow(workflow: Workflow, handlers: Record<string, StepHandler> = {}): void {
  if (!workflow?.id) throw new Error('Workflow missing id');
  workflows.set(workflow.id, { workflow, handlers });
}

function getWorkflow(workflowId: string): Workflow {
  const entry = workflows.get(workflowId);
  if (!entry) throw new Error(`Workflow not registered: ${workflowId}`);
  return entry.workflow;
}

function getStepHandler(workflowId: string, stepType: string): StepHandler {
  const entry = workflows.get(workflowId);
  if (!entry) throw new Error(`Workflow not registered: ${workflowId}`);
  const handler = entry.handlers[stepType];
  if (!handler) throw new Error(`Step handler not registered: ${workflowId}/${stepType}`);
  return handler;
}

function listWorkflows(): Workflow[] {
  return Array.from(workflows.values()).map((entry) => entry.workflow);
}

export { registerWorkflow, getWorkflow, getStepHandler, listWorkflows };
export type { Workflow, WorkflowStep, StepHandler, StepHandlerExecuteResult };
