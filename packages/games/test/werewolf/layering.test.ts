import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 狼人杀模块分层守卫（口径见 docs/games/werewolf.md「模块分层」）：
 * 1. src/werewolf 内不允许运行时 import 环（`import type` 不算）；
 * 2. special/index.ts 登记表只能被四条结算管线与 roleSpecs / spec / triggers 引用，基础规则与 special/* 不得反向依赖。
 */
const ROOT = resolve(__dirname, '../../src/werewolf');
const REGISTRY = 'special/index.ts';
const REGISTRY_CONSUMERS = new Set([
  'rules/nightResolution.ts', 'rules/dawn.ts', 'rules/victory.ts', 'rules/day.ts', 'roleSpecs.ts', 'spec.ts', 'triggers.ts',
]);

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return listFiles(path);
    return entry.endsWith('.ts') ? [path] : [];
  });
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

// `import X from`、`import { a, type B } from`、`export { a } from`、`export * from`；排除 `import type` / `export type`
const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s+(type\s+)?([^'";]*?)\s*from\s+['"]([^'"]+)['"]/g;

/** 只有类型成员的命名导入（`import { type A, type B }`）会被 TS 擦除，不算运行时依赖 */
function typeOnlyMembers(clause: string): boolean {
  const braces = /\{([^}]*)\}/.exec(clause);
  if (!braces || clause.replace(braces[0], '').replace(/[,\s]/g, '') !== '') return false;
  const members = (braces[1] ?? '').split(',').map((member) => member.trim()).filter(Boolean);
  return members.length > 0 && members.every((member) => member.startsWith('type '));
}

function resolveImport(file: string, spec: string): string {
  const base = resolve(dirname(file), spec);
  const candidates = [base.endsWith('.ts') ? base : `${base}.ts`, join(base, 'index.ts')];
  const target = candidates.find((candidate) => { try { return statSync(candidate).isFile(); } catch { return false; } });
  if (!target) throw new Error(`${relative(ROOT, file)}: 无法解析 ${spec}`);
  return target;
}

function runtimeImports(file: string): string[] {
  const source = stripComments(readFileSync(file, 'utf8'));
  const targets: string[] = [];
  for (const match of source.matchAll(IMPORT_RE)) {
    const [, typeKeyword, clause = '', spec = ''] = match;
    if (typeKeyword || !spec.startsWith('.') || typeOnlyMembers(clause)) continue;
    targets.push(resolveImport(file, spec));
  }
  return targets;
}

function buildGraph(): Map<string, string[]> {
  const id = (file: string): string => relative(ROOT, file);
  return new Map(listFiles(ROOT).map((file) => [id(file), runtimeImports(file).map(id)]));
}

/** Tarjan 强连通分量：返回含环的分量（多个文件，或自引用） */
function cycles(graph: Map<string, string[]>): string[][] {
  let counter = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const found: string[][] = [];
  const visit = (node: string): void => {
    index.set(node, counter);
    low.set(node, counter);
    counter += 1;
    stack.push(node);
    onStack.add(node);
    for (const next of graph.get(node) ?? []) {
      if (!index.has(next)) {
        visit(next);
        low.set(node, Math.min(low.get(node) ?? 0, low.get(next) ?? 0));
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node) ?? 0, index.get(next) ?? 0));
      }
    }
    if (low.get(node) !== index.get(node)) return;
    const component: string[] = [];
    let popped: string | undefined;
    do {
      popped = stack.pop();
      if (popped !== undefined) { onStack.delete(popped); component.push(popped); }
    } while (popped !== node);
    if (component.length > 1 || (graph.get(node) ?? []).includes(node)) found.push(component.sort());
  };
  for (const node of graph.keys()) if (!index.has(node)) visit(node);
  return found;
}

describe('werewolf module layering', () => {
  const graph = buildGraph();

  it('scans the whole werewolf module', () => {
    expect(graph.size).toBeGreaterThan(80);
    expect(graph.has(REGISTRY)).toBe(true);
  });

  it('has no runtime import cycles', () => {
    expect(cycles(graph)).toEqual([]);
  });

  it('only lets the settlement pipelines, roleSpecs, spec and triggers read the special registry', () => {
    const consumers = [...graph].filter(([, imports]) => imports.includes(REGISTRY)).map(([file]) => file).sort();
    expect(consumers).toEqual([...REGISTRY_CONSUMERS].sort());
  });
});
