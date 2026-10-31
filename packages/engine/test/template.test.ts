import { describe, expect, it } from 'vitest';
import { TemplateError } from '../src/errors';
import { collectTemplatePaths, parseTemplate, renderTemplate } from '../src/prompt/template';

describe('template', () => {
  const context = {
    me: { label: '1号 张三', position: null },
    seats: [{ label: '1号' }, { label: '2号' }],
    empty: [],
    flag: true,
  };

  it('renders variables, each and if', () => {
    const template = parseTemplate('t', '{{me.label}}|{{#each seats}}[{{this.label}}]{{/each}}|{{#if flag}}是{{else}}否{{/if}}|{{#if empty}}有{{else}}无{{/if}}');
    expect(renderTemplate(template, context)).toBe('1号 张三|[1号][2号]|是|无');
  });

  it('renders null as empty string', () => {
    expect(renderTemplate(parseTemplate('t', '位置{{me.position}}'), context)).toBe('位置');
  });

  it('rejects unknown variables and non-scalar output', () => {
    expect(() => renderTemplate(parseTemplate('t', '{{me.missing}}'), context)).toThrow(TemplateError);
    expect(() => renderTemplate(parseTemplate('t', '{{seats}}'), context)).toThrow(/标量/);
    expect(() => renderTemplate(parseTemplate('t', '{{#each me}}x{{/each}}'), context)).toThrow(/数组/);
  });

  it('rejects malformed templates at parse time', () => {
    expect(() => parseTemplate('t', '{{#if flag}}x')).toThrow(/没有闭合/);
    expect(() => parseTemplate('t', 'x{{/each}}')).toThrow(/不匹配/);
    expect(() => parseTemplate('t', '{{else}}')).toThrow(/else/);
    expect(() => parseTemplate('t', '{{me label}}')).toThrow(/非法变量/);
  });

  it('collects paths and marks each-relative ones', () => {
    const paths = collectTemplatePaths(parseTemplate('t', '{{#each seats}}{{this.label}}{{/each}}{{state.x}}'));
    expect(paths).toEqual([
      { path: 'seats', relative: false },
      { path: 'this.label', relative: true },
      { path: 'state.x', relative: false },
    ]);
  });
});
