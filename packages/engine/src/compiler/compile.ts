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

type Assignment = Readonly<Record<string, number | 'rest'>>;

function checkAssignment(spec: AnyGameSpec, assign: Assignment, players: { min: number; max: number }, where: string): string[] {
  const issues: string[] = [];
  const { min, max } = players;
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || min > max) {
    issues.push(`${where} 的人数范围无效：${min}-${max}`);
  }
  const entries = Object.entries(assign);
  const unknownRoles = entries.filter(([role]) => !spec.roles[role]).map(([role]) => role);
  if (unknownRoles.length) issues.push(`${where} 引用了未定义的角色：${unknownRoles.join('、')}`);
  const restRoles = entries.filter(([, count]) => count === 'rest');
  if (restRoles.length > 1) issues.push(`${where} 最多只能有一个角色取 rest`);
  const fixed = entries.reduce((sum, [, count]) => sum + (count === 'rest' ? 0 : count), 0);
  if (restRoles.length === 0 && (fixed !== min || fixed !== max)) {
    issues.push(`${where} 没有 rest 角色时，固定人数 ${fixed} 必须同时等于人数下限与上限`);
  }
  if (restRoles.length === 1 && fixed >= min) {
    issues.push(`${where} 固定人数 ${fixed} 不少于人数下限 ${min}，rest 角色 ${restRoles[0]?.[0]} 将没有人`);
  }
  for (const [role, count] of entries) {
    const positions = spec.roles[role]?.positions;
    const minimum = count === 'rest' ? min - fixed : count;
    if (positions !== undefined && positions > minimum) {
      issues.push(`${where} 中角色 ${role} 有 ${positions} 个席位，但最少只分到 ${minimum} 人`);
    }
  }
  return issues;
}

function checkPlayersAndRoles(spec: AnyGameSpec): string[] {
  const issues = checkAssignment(spec, spec.setup.assign, spec.players, 'setup.assign');
  const variants = Object.entries(spec.variants ?? {});
  if (variants.length && (!spec.defaultVariant || !spec.variants?.[spec.defaultVariant])) {
    issues.push(`defaultVariant 必须指向已定义的变体，当前为 "${spec.defaultVariant ?? ''}"`);
  }
  if (!variants.length && spec.defaultVariant) issues.push('没有定义 variants 时不能设置 defaultVariant');
  for (const [key, variant] of variants) {
    issues.push(...checkAssignment(spec, variant.assign, variant.players ?? spec.players, `变体 ${key}`));
  }
  const misnamed = Object.entries(spec.prompts).filter(([key, template]) => key !== template.name).map(([key]) => key);
  if (misnamed.length) issues.push(`spec.prompts 的 key 必须与模板名一致：${misnamed.join('、')}`);
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
