import { TemplateError } from '../errors';

// 极简模板：{{path}}、{{#each path}}…{{/each}}、{{#if path}}…{{else}}…{{/if}}。
// 不支持表达式与函数调用；需要计算的值由规则函数提前算好放进上下文。

export type TemplateNode =
  | { readonly type: 'text'; readonly value: string }
  | { readonly type: 'var'; readonly path: string }
  | { readonly type: 'each'; readonly path: string; readonly body: readonly TemplateNode[] }
  | {
      readonly type: 'if';
      readonly path: string;
      readonly then: readonly TemplateNode[];
      readonly otherwise: readonly TemplateNode[];
    };

export interface PromptTemplate {
  readonly name: string;
  readonly source: string;
  readonly nodes: readonly TemplateNode[];
}

export interface TemplatePath {
  readonly path: string;
  /** 位于 each 块内且以 this 开头的路径，相对当前元素解析 */
  readonly relative: boolean;
}

const TAG_PATTERN = /\{\{\s*([^{}]*?)\s*\}\}/g;
const PATH_PATTERN = /^(this|[A-Za-z_]\w*)(\.[A-Za-z_]\w*)*$/;

interface Frame {
  readonly kind: 'root' | 'each' | 'if';
  readonly path: string;
  readonly nodes: TemplateNode[];
  readonly otherwise: TemplateNode[];
  inElse: boolean;
}

function assertPath(name: string, path: string): string {
  if (!PATH_PATTERN.test(path)) throw new TemplateError(name, `非法变量路径 "${path}"`);
  return path;
}

function target(frame: Frame): TemplateNode[] {
  return frame.inElse ? frame.otherwise : frame.nodes;
}

export function parseTemplate(name: string, source: string): PromptTemplate {
  const root: Frame = { kind: 'root', path: '', nodes: [], otherwise: [], inElse: false };
  const stack: Frame[] = [root];
  let cursor = 0;
  const current = (): Frame => stack[stack.length - 1] ?? root;

  for (const match of source.matchAll(TAG_PATTERN)) {
    const index = match.index;
    if (index > cursor) target(current()).push({ type: 'text', value: source.slice(cursor, index) });
    cursor = index + match[0].length;
    const tag = (match[1] ?? '').trim();

    if (tag.startsWith('#each ') || tag.startsWith('#if ')) {
      const kind = tag.startsWith('#each ') ? 'each' : 'if';
      const path = assertPath(name, tag.slice(kind.length + 1).trim());
      stack.push({ kind, path, nodes: [], otherwise: [], inElse: false });
    } else if (tag === 'else') {
      const frame = current();
      if (frame.kind !== 'if' || frame.inElse) throw new TemplateError(name, '{{else}} 只能出现在 {{#if}} 内且只能出现一次');
      frame.inElse = true;
    } else if (tag === '/each' || tag === '/if') {
      const frame = stack.pop();
      if (!frame || frame.kind !== tag.slice(1)) throw new TemplateError(name, `多余或不匹配的 {{${tag}}}`);
      const node: TemplateNode = frame.kind === 'each'
        ? { type: 'each', path: frame.path, body: frame.nodes }
        : { type: 'if', path: frame.path, then: frame.nodes, otherwise: frame.otherwise };
      target(current()).push(node);
    } else {
      target(current()).push({ type: 'var', path: assertPath(name, tag) });
    }
  }

  if (stack.length !== 1) throw new TemplateError(name, `{{#${current().kind}}} 没有闭合`);
  if (cursor < source.length) root.nodes.push({ type: 'text', value: source.slice(cursor) });
  return { name, source, nodes: root.nodes };
}

function resolve(template: PromptTemplate, context: unknown, scope: unknown, path: string): unknown {
  const [head, ...rest] = path.split('.');
  let value: unknown = head === 'this' ? scope : context;
  const segments = head === 'this' ? rest : [head ?? '', ...rest];
  for (const segment of segments) {
    if (value === null || typeof value !== 'object' || !(segment in value)) {
      throw new TemplateError(template.name, `未知变量 {{${path}}}`);
    }
    value = (value as Record<string, unknown>)[segment];
  }
  return value;
}

function renderNodes(template: PromptTemplate, nodes: readonly TemplateNode[], context: unknown, scope: unknown): string {
  return nodes.map((node) => {
    if (node.type === 'text') return node.value;
    const value = resolve(template, context, scope, node.path);
    if (node.type === 'var') {
      if (value === null) return '';
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
      throw new TemplateError(template.name, `{{${node.path}}} 不是可输出的标量`);
    }
    if (node.type === 'each') {
      if (!Array.isArray(value)) throw new TemplateError(template.name, `{{#each ${node.path}}} 需要数组`);
      return value.map((item: unknown) => renderNodes(template, node.body, context, item)).join('');
    }
    const truthy = Array.isArray(value) ? value.length > 0 : Boolean(value);
    return renderNodes(template, truthy ? node.then : node.otherwise, context, scope);
  }).join('');
}

export function renderTemplate(template: PromptTemplate, context: Readonly<Record<string, unknown>>): string {
  return renderNodes(template, template.nodes, context, undefined).trim();
}

export function collectTemplatePaths(template: PromptTemplate): TemplatePath[] {
  const paths: TemplatePath[] = [];
  const walk = (nodes: readonly TemplateNode[], inEach: boolean): void => {
    for (const node of nodes) {
      if (node.type === 'text') continue;
      paths.push({ path: node.path, relative: inEach && node.path.split('.')[0] === 'this' });
      if (node.type === 'each') walk(node.body, true);
      if (node.type === 'if') {
        walk(node.then, inEach);
        walk(node.otherwise, inEach);
      }
    }
  };
  walk(template.nodes, false);
  return paths;
}
