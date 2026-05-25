const ALLOWED_ROOTS = new Set(['config', 'publicState', 'stepState', 'round', 'phaseId', 'stepId']);

interface ConditionContext {
  config?: Record<string, unknown>;
  publicState?: Record<string, unknown>;
  stepState?: Record<string, unknown>;
  round?: unknown;
  phaseId?: string;
  stepId?: string;
  [key: string]: unknown;
}

interface VarRef {
  var: string;
}

interface LogicCondition {
  op: 'and' | 'or' | 'not';
  args?: Condition[];
  left?: Condition;
}

interface CompareCondition {
  op: 'eq' | 'ne' | 'exists' | 'gt' | 'gte' | 'lt' | 'lte';
  left?: unknown;
  right?: unknown;
}

type Condition = boolean | VarRef | LogicCondition | CompareCondition | null | undefined;

function evaluateCondition(condition: Condition, context: ConditionContext = {}): boolean {
  if (condition == null) return true;
  if (typeof condition === 'boolean') return condition;
  if (typeof condition === 'object' && 'var' in condition && condition.var) {
    return Boolean(readVar(condition.var, context));
  }

  const op = (condition as CompareCondition | LogicCondition).op;
  if (op === 'and') return ((condition as LogicCondition).args || []).every((item) => evaluateCondition(item, context));
  if (op === 'or') return ((condition as LogicCondition).args || []).some((item) => evaluateCondition(item, context));
  if (op === 'not') return !evaluateCondition(((condition as LogicCondition).args || [])[0] ?? (condition as CompareCondition).left as Condition, context);

  const left = resolveValue((condition as CompareCondition).left, context);
  const right = resolveValue((condition as CompareCondition).right, context);
  if (op === 'eq') return left === right;
  if (op === 'ne') return left !== right;
  if (op === 'exists') return left !== undefined && left !== null;
  if (op === 'gt') return Number(left) > Number(right);
  if (op === 'gte') return Number(left) >= Number(right);
  if (op === 'lt') return Number(left) < Number(right);
  if (op === 'lte') return Number(left) <= Number(right);
  throw new Error(`Unsupported workflow condition op: ${op}`);
}

function resolveValue(value: unknown, context: ConditionContext): unknown {
  if (value && typeof value === 'object' && 'var' in value && (value as VarRef).var) {
    return readVar((value as VarRef).var, context);
  }
  return value;
}

function readVar(path: string, context: ConditionContext): unknown {
  const parts = String(path || '').split('.').filter(Boolean);
  if (!parts.length || !ALLOWED_ROOTS.has(parts[0])) {
    throw new Error(`Workflow condition cannot access path: ${path}`);
  }
  return parts.reduce(
    (value: unknown, key: string) => (value == null ? undefined : (value as Record<string, unknown>)[key]),
    context as unknown,
  );
}

export { evaluateCondition, readVar };
export type { Condition, ConditionContext };
