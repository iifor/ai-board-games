const ALLOWED_ROOTS = new Set(['config', 'publicState', 'stepState', 'round', 'phaseId', 'stepId']);

function evaluateCondition(condition, context = {}) {
  if (condition == null) return true;
  if (typeof condition === 'boolean') return condition;
  if (condition.var) return Boolean(readVar(condition.var, context));

  const op = condition.op;
  if (op === 'and') return (condition.args || []).every((item) => evaluateCondition(item, context));
  if (op === 'or') return (condition.args || []).some((item) => evaluateCondition(item, context));
  if (op === 'not') return !evaluateCondition((condition.args || [])[0] ?? condition.left, context);

  const left = resolveValue(condition.left, context);
  const right = resolveValue(condition.right, context);
  if (op === 'eq') return left === right;
  if (op === 'ne') return left !== right;
  if (op === 'exists') return left !== undefined && left !== null;
  if (op === 'gt') return Number(left) > Number(right);
  if (op === 'gte') return Number(left) >= Number(right);
  if (op === 'lt') return Number(left) < Number(right);
  if (op === 'lte') return Number(left) <= Number(right);
  throw new Error(`Unsupported workflow condition op: ${op}`);
}

function resolveValue(value, context) {
  if (value && typeof value === 'object' && value.var) return readVar(value.var, context);
  return value;
}

function readVar(path, context) {
  const parts = String(path || '').split('.').filter(Boolean);
  if (!parts.length || !ALLOWED_ROOTS.has(parts[0])) {
    throw new Error(`Workflow condition cannot access path: ${path}`);
  }
  return parts.reduce((value, key) => (value == null ? undefined : value[key]), context);
}

module.exports = { evaluateCondition, readVar };
