const workflows = new Map();

function registerWorkflow(workflow, handlers = {}) {
  if (!workflow?.id) throw new Error('Workflow missing id');
  workflows.set(workflow.id, { workflow, handlers });
}

function getWorkflow(workflowId) {
  const entry = workflows.get(workflowId);
  if (!entry) throw new Error(`Workflow not registered: ${workflowId}`);
  return entry.workflow;
}

function getStepHandler(workflowId, stepType) {
  const entry = workflows.get(workflowId);
  if (!entry) throw new Error(`Workflow not registered: ${workflowId}`);
  const handler = entry.handlers[stepType];
  if (!handler) throw new Error(`Step handler not registered: ${workflowId}/${stepType}`);
  return handler;
}

function listWorkflows() {
  return Array.from(workflows.values()).map((entry) => entry.workflow);
}

module.exports = {
  registerWorkflow,
  getWorkflow,
  getStepHandler,
  listWorkflows
};
