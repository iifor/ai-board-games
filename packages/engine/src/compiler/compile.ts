import { SpecError } from '../errors';
import type { PromptTemplate } from '../prompt/template';
import type { NextSpec, PhaseSpec } from '../spec/phases';
import type { AnyGameSpec, GameSpec } from '../spec/types';
import { checkTemplates } from './checkTemplates';
import { computeSpecHash } from './specHash';

export const END_PHASE = 'end';

export interface CompiledGame<S = unknown, P = unknown> {
  readonly spec: GameSpec<S, P>;
  readonly hash: string;
  /** 模板名 → 模板，用于按名字找回发言轮次覆盖的模板 */
  readonly prompts: ReadonlyMap<string, PromptTemplate>;
}

function targetsOf(next: NextSpec<unknown, unknown>): string[] {
  return typeof next === 'string' ? [next] : next.map((transition) => transition.goto);
}

function checkPlayersAndRoles(spec: AnyGameSpec): string[] {
  const issues: string[] = [];
  const { min, max } = spec.players;
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || min > max) {
    issues.push(`players 范围无效：${min}-${max}`);
  }
  const entries = Object.entries(spec.setup.assign);
  const unknownRoles = entries.filter(([role]) => !spec.roles[role]).map(([role]) => role);
  if (unknownRoles.length) issues.push(`setup.assign 引用了未定义的角色：${unknownRoles.join('、')}`);
  const restRoles = entries.filter(([, count]) => count === 'rest');
  if (restRoles.length > 1) issues.push('setup.assign 最多只能有一个角色取 rest');
  const fixed = entries.reduce((sum, [, count]) => sum + (count === 'rest' ? 0 : count), 0);
  if (restRoles.length === 0 && (fixed !== min || fixed !== max)) {
    issues.push(`没有 rest 角色时，固定人数 ${fixed} 必须同时等于 players.min 与 players.max`);
  }
  if (restRoles.length === 1 && fixed >= min) {
    issues.push(`固定人数 ${fixed} 不少于 players.min ${min}，rest 角色 ${restRoles[0]?.[0]} 将没有人`);
  }
  for (const [role, count] of entries) {
    const positions = spec.roles[role]?.positions;
    const minimum = count === 'rest' ? min - fixed : count;
    if (positions !== undefined && positions > minimum) {
      issues.push(`角色 ${role} 有 ${positions} 个席位，但最少只分到 ${minimum} 人`);
    }
  }
  return issues;
}

function checkPhaseGraph(spec: AnyGameSpec): string[] {
  const issues: string[] = [];
  const phases = spec.phases as Readonly<Record<string, PhaseSpec<unknown, unknown>>>;
  if (END_PHASE in phases) issues.push(`"${END_PHASE}" 是保留字，不能作为阶段 ID`);
  if (!phases[spec.start]) issues.push(`start 指向不存在的阶段 "${spec.start}"`);

  for (const [id, phase] of Object.entries(phases)) {
    if (typeof phase.next !== 'string') {
      const last = phase.next[phase.next.length - 1];
      if (!last) issues.push(`阶段 ${id} 的 next 不能为空列表`);
      else if (last.when) issues.push(`阶段 ${id} 的 next 最后一项必须无条件`);
    }
    for (const target of targetsOf(phase.next)) {
      if (target !== END_PHASE && !phases[target]) issues.push(`阶段 ${id} 跳转到不存在的阶段 "${target}"`);
    }
  }

  const reachable = new Set<string>();
  const queue = phases[spec.start] ? [spec.start] : [];
  while (queue.length) {
    const id = queue.shift() as string;
    if (reachable.has(id)) continue;
    reachable.add(id);
    const phase = phases[id];
    if (phase) queue.push(...targetsOf(phase.next).filter((target) => target !== END_PHASE));
  }
  const unreachable = Object.keys(phases).filter((id) => !reachable.has(id));
  if (unreachable.length) issues.push(`以下阶段从 start 不可达：${unreachable.join('、')}`);
  return issues;
}

/** 校验 spec 并生成引擎可执行的 CompiledGame；所有问题一次性汇总抛出 */
export function compileGame<S, P>(spec: GameSpec<S, P>): CompiledGame<S, P> {
  const erased: AnyGameSpec = spec;
  const issues: string[] = [];
  if (!spec.key.trim()) issues.push('key 不能为空');
  if (!Number.isInteger(spec.version) || spec.version < 1) issues.push('version 必须是正整数');
  issues.push(...checkPlayersAndRoles(erased), ...checkPhaseGraph(erased), ...checkTemplates(erased));
  if (issues.length) throw new SpecError(spec.key || '(未命名)', issues);

  const prompts = new Map(Object.values(spec.prompts).map((template) => [template.name, template]));
  return { spec, hash: computeSpecHash(spec), prompts };
}
