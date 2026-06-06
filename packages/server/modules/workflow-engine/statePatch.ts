interface StatePatchSetOperation {
  path: string[];
  value: unknown;
}

interface StatePatch {
  set: StatePatchSetOperation[];
  remove: string[][];
}

const UNSAFE_PATH_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

function createStatePatch(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): StatePatch | null {
  const patch: StatePatch = { set: [], remove: [] };
  diffObject(previous, next, [], patch);
  return patch.set.length || patch.remove.length ? patch : null;
}

function applyStatePatch(
  state: Record<string, unknown>,
  patch: StatePatch,
): Record<string, unknown> {
  const next = cloneRecord(state);
  for (const operation of patch.set || []) {
    if (!isSafePath(operation.path)) continue;
    setAtPath(next, operation.path, cloneValue(operation.value));
  }
  for (const path of patch.remove || []) {
    if (!isSafePath(path)) continue;
    removeAtPath(next, path);
  }
  return next;
}

function isStatePatch(value: unknown): value is StatePatch {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as StatePatch;
  return Array.isArray(candidate.set) && Array.isArray(candidate.remove);
}

function diffObject(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
  path: string[],
  patch: StatePatch,
): void {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const key of keys) {
    const childPath = [...path, key];
    if (!(key in next)) {
      patch.remove.push(childPath);
      continue;
    }
    if (!(key in previous)) {
      patch.set.push({ path: childPath, value: cloneValue(next[key]) });
      continue;
    }
    const previousValue = previous[key];
    const nextValue = next[key];
    if (Object.is(previousValue, nextValue)) continue;
    if (isPlainObject(previousValue) && isPlainObject(nextValue)) {
      diffObject(previousValue, nextValue, childPath, patch);
      continue;
    }
    if (!deepEqual(previousValue, nextValue)) {
      patch.set.push({ path: childPath, value: cloneValue(nextValue) });
    }
  }
}

function setAtPath(target: Record<string, unknown>, path: string[], value: unknown): void {
  if (!path.length) return;
  let cursor = target;
  for (const segment of path.slice(0, -1)) {
    const current = cursor[segment];
    if (!isPlainObject(current)) cursor[segment] = {};
    cursor = cursor[segment] as Record<string, unknown>;
  }
  cursor[path[path.length - 1]] = value;
}

function removeAtPath(target: Record<string, unknown>, path: string[]): void {
  if (!path.length) return;
  let cursor = target;
  for (const segment of path.slice(0, -1)) {
    const current = cursor[segment];
    if (!isPlainObject(current)) return;
    cursor = current;
  }
  delete cursor[path[path.length - 1]];
}

function isSafePath(path: string[]): boolean {
  return path.length > 0 && path.every((segment) => segment && !UNSAFE_PATH_SEGMENTS.has(segment));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((item, index) => deepEqual(item, right[index]));
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key) => key in right && deepEqual(left[key], right[key]));
  }
  return false;
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return cloneValue(value) as Record<string, unknown>;
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null)) as T;
}

export { createStatePatch, applyStatePatch, isStatePatch, deepEqual };
export type { StatePatch, StatePatchSetOperation };
