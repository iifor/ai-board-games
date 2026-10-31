import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// engine 与 games 必须是纯运行时：不做 IO、不读时钟、不用全局随机数。
// 类型层面由 tsconfig 的 `types: []` 挡住 Node 全局；这里补上类型挡不住的部分：
// 依赖白名单，以及 ES 内置但不确定的调用（Date.now、Math.random 等）。

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

interface PurityTarget {
  sourceDir: string;
  allowedImports: readonly string[];
}

const TARGETS: readonly PurityTarget[] = [
  { sourceDir: 'packages/engine/src', allowedImports: ['zod', '@battle/shared'] },
  { sourceDir: 'packages/games/src', allowedImports: ['zod', '@battle/engine'] },
];

const BANNED_CALLS: readonly { pattern: RegExp; reason: string }[] = [
  { pattern: /\bDate\.now\s*\(/, reason: '时间必须由引擎输入提供' },
  { pattern: /\bnew\s+Date\s*\(/, reason: '时间必须由引擎输入提供' },
  { pattern: /\bperformance\.now\s*\(/, reason: '时间必须由引擎输入提供' },
  { pattern: /\bMath\.random\s*\(/, reason: '随机数必须使用引擎种子 RNG' },
  { pattern: /\bcrypto\.getRandomValues\s*\(/, reason: '随机数必须使用引擎种子 RNG' },
  { pattern: /\bfetch\s*\(/, reason: '引擎不得发起网络请求' },
  { pattern: /\bconsole\./, reason: '引擎输出必须通过日志条目返回' },
  { pattern: /\brequire\s*\(/, reason: '只允许 ESM import' },
  { pattern: /\bimport\s*\(/, reason: '不允许动态 import' },
];

const IMPORT_PATTERN = /(?:^|\s)(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm;

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return listSourceFiles(path);
    const isSource = /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry);
    return isSource ? [path] : [];
  });
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function findViolations(target: PurityTarget): string[] {
  const root = join(REPO_ROOT, target.sourceDir);
  return listSourceFiles(root).flatMap((file) => {
    const source = stripComments(readFileSync(file, 'utf8'));
    const location = relative(REPO_ROOT, file);
    const importViolations = [...source.matchAll(IMPORT_PATTERN)]
      .map((match) => match[1] ?? match[2] ?? '')
      .filter((specifier) => !specifier.startsWith('.') && !target.allowedImports.includes(specifier))
      .map((specifier) => `${location}: 不允许依赖 "${specifier}"`);
    const callViolations = BANNED_CALLS
      .filter(({ pattern }) => pattern.test(source))
      .map(({ pattern, reason }) => `${location}: ${pattern.source}（${reason}）`);
    return [...importViolations, ...callViolations];
  });
}

describe('engine purity', () => {
  it.each(TARGETS)('$sourceDir only uses allowed imports and deterministic APIs', (target) => {
    expect(findViolations(target)).toEqual([]);
  });

  it('detects banned imports and calls', () => {
    const probe = 'import fs from "node:fs";\nexport const t = Date.now();';
    const imports = [...probe.matchAll(IMPORT_PATTERN)].map((match) => match[1] ?? match[2]);
    expect(imports).toEqual(['node:fs']);
    expect(BANNED_CALLS.some(({ pattern }) => pattern.test(probe))).toBe(true);
  });
});
