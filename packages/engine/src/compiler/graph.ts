import type { NextSpec, PhaseSpec } from '../spec/phases';
import type { AnyGameSpec } from '../spec/types';

export const END_PHASE = 'end';
export const RETURN_PHASE = 'return';
const RESERVED = new Set([END_PHASE, RETURN_PHASE]);

type Phases = Readonly<Record<string, PhaseSpec<unknown, unknown>>>;

function targetsOf(next: NextSpec<unknown, unknown>): string[] {
  return typeof next === 'string' ? [next] : next.map((transition) => transition.goto);
}

function walk(phases: Phases, roots: readonly string[]): Set<string> {
  const reached = new Set<string>();
  const queue = roots.filter((root) => phases[root]);
  while (queue.length) {
    const id = queue.shift() as string;
    if (reached.has(id)) continue;
    reached.add(id);
    const phase = phases[id];
    if (phase) queue.push(...targetsOf(phase.next).filter((target) => !RESERVED.has(target)));
  }
  return reached;
}

function checkTriggers(spec: AnyGameSpec, phases: Phases): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const trigger of spec.triggers ?? []) {
    if (ids.has(trigger.id)) issues.push(`触发器 ID 重复：${trigger.id}`);
    ids.add(trigger.id);
    if (Boolean(trigger.push) === Boolean(trigger.jump)) issues.push(`触发器 ${trigger.id} 必须且只能指定 push 或 jump 之一`);
    if (trigger.push && !phases[trigger.push]) issues.push(`触发器 ${trigger.id} push 到不存在的阶段 "${trigger.push}"`);
    if (trigger.jump && trigger.jump !== END_PHASE && !phases[trigger.jump]) {
      issues.push(`触发器 ${trigger.id} jump 到不存在的阶段 "${trigger.jump}"`);
    }
    if (trigger.round && !trigger.jump) issues.push(`触发器 ${trigger.id} 的 round 只能与 jump 一起使用`);
  }
  const gameOver = spec.gameOver?.goto;
  if (gameOver && gameOver !== END_PHASE && !phases[gameOver]) issues.push(`gameOver 转入不存在的阶段 "${gameOver}"`);
  return issues;
}

/** 阶段图校验：跳转目标存在、所有阶段可达、只有触发器插入的阶段链才能 return */
export function checkPhaseGraph(spec: AnyGameSpec): string[] {
  const phases = spec.phases as Phases;
  const issues: string[] = [];
  for (const reserved of RESERVED) if (reserved in phases) issues.push(`"${reserved}" 是保留字，不能作为阶段 ID`);
  if (!phases[spec.start]) issues.push(`start 指向不存在的阶段 "${spec.start}"`);

  for (const [id, phase] of Object.entries(phases)) {
    if (typeof phase.next !== 'string') {
      const last = phase.next[phase.next.length - 1];
      if (!last) issues.push(`阶段 ${id} 的 next 不能为空列表`);
      else if (last.when) issues.push(`阶段 ${id} 的 next 最后一项必须无条件`);
    }
    for (const target of targetsOf(phase.next)) {
      if (!RESERVED.has(target) && !phases[target]) issues.push(`阶段 ${id} 跳转到不存在的阶段 "${target}"`);
    }
  }
  issues.push(...checkTriggers(spec, phases));

  const triggers = spec.triggers ?? [];
  const mainRoots = [spec.start, ...triggers.flatMap((trigger) => (trigger.jump ? [trigger.jump] : []))];
  if (spec.gameOver) mainRoots.push(spec.gameOver.goto);
  const main = walk(phases, mainRoots);
  const pushed = walk(phases, triggers.flatMap((trigger) => (trigger.push ? [trigger.push] : [])));

  const unreachable = Object.keys(phases).filter((id) => !main.has(id) && !pushed.has(id));
  if (unreachable.length) issues.push(`以下阶段不可达：${unreachable.join('、')}`);
  for (const id of main) {
    const phase = phases[id];
    if (phase && targetsOf(phase.next).includes(RETURN_PHASE)) {
      issues.push(`阶段 ${id} 可从主流程到达，不能 return（只有触发器插入的阶段链可以 return）`);
    }
  }
  return issues;
}
