import { SpecError } from '../errors';
import type { PromptTemplate } from '../prompt/template';
import type { AnyGameSpec, GameSpec } from '../spec/types';
import { checkTemplates } from './checkTemplates';
import { checkPhaseGraph } from './graph';
import { computeSpecHash } from './specHash';

export { END_PHASE, RETURN_PHASE } from './graph';

export interface CompiledGame<S = unknown, P = unknown> {
  readonly spec: GameSpec<S, P>;
  readonly hash: string;
  /** 模板名 → 模板，用于按名字找回发言轮次覆盖的模板 */
  readonly prompts: ReadonlyMap<string, PromptTemplate>;
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
