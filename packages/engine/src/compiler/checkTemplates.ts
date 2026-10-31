import { collectTemplatePaths, type PromptTemplate } from '../prompt/template';
import type { AnyGameSpec, Visibility } from '../spec/types';

const SEAT_ROOTS = new Set([
  'me', 'title', 'round', 'phase', 'seats', 'aliveSeats', 'teammates', 'params', 'state', 'turn', 'legalTargets',
]);
const PUBLIC_ROOTS = new Set(['title', 'round', 'phase', 'seats', 'aliveSeats', 'params', 'state']);

function visibilityOf(spec: AnyGameSpec, field: string): Visibility {
  const map = (spec.state.visibility ?? {}) as Readonly<Record<string, Visibility | undefined>>;
  return map[field] ?? 'host';
}

function checkPaths(spec: AnyGameSpec, template: PromptTemplate, publicOnly: boolean): string[] {
  const roots = publicOnly ? PUBLIC_ROOTS : SEAT_ROOTS;
  const issues: string[] = [];
  for (const { path, relative } of collectTemplatePaths(template)) {
    if (relative) continue;
    const [root, field] = path.split('.');
    if (root === 'this') {
      issues.push(`模板 "${template.name}" 在 each 之外使用了 {{${path}}}`);
    } else if (!root || !roots.has(root)) {
      issues.push(`模板 "${template.name}" 引用了${publicOnly ? '公开上下文中' : ''}不存在的变量 {{${path}}}`);
    } else if (root === 'state' && field) {
      const visibility = visibilityOf(spec, field);
      if (visibility === 'host' || (publicOnly && visibility !== 'public')) {
        issues.push(`模板 "${template.name}" 引用了${publicOnly ? '非公开' : '对 AI 不可见'}的状态字段 state.${field}`);
      }
    }
  }
  return issues;
}

/** 模板静态检查：引用的模板都已登记、变量根合法、引用的状态字段可见 */
export function checkTemplates(spec: AnyGameSpec): string[] {
  const registered = new Set(Object.values(spec.prompts));
  const issues: string[] = [];
  const requireRegistered = (template: PromptTemplate, where: string): void => {
    if (!registered.has(template)) issues.push(`${where} 使用的模板 "${template.name}" 未登记在 spec.prompts 中`);
  };

  requireRegistered(spec.rulesText, 'rulesText');
  for (const [key, role] of Object.entries(spec.roles)) requireRegistered(role.identity, `角色 ${key}`);

  const announceTemplates = new Set<PromptTemplate>();
  for (const [id, phase] of Object.entries(spec.phases)) {
    if (phase.kind === 'announce') {
      requireRegistered(phase.text, `阶段 ${id}`);
      announceTemplates.add(phase.text);
    } else if ('prompt' in phase) {
      requireRegistered(phase.prompt, `阶段 ${id}`);
    }
  }

  for (const template of registered) {
    issues.push(...checkPaths(spec, template, announceTemplates.has(template)));
  }
  return issues;
}
