import { TemplateError } from '../errors';
import { parseTemplate, renderTemplate, type PromptTemplate } from './template';

/** 保留渲染成功的源码，供历史请求及调试台复现。错误仅进入管理端诊断。 */
export function renderMatchTemplate(template: PromptTemplate, source: string | undefined,
  context: Readonly<Record<string, unknown>>, onFallback?: (name: string) => void) {
  if (source !== undefined && source !== template.source) {
    try {
      const text = renderTemplate(parseTemplate(template.name, source), context, 32000);
      if (text) return { source, text };
    } catch (cause) {
      if (!(cause instanceof TemplateError)) throw cause;
    }
    onFallback?.(template.name);
  }
  return { source: template.source, text: renderTemplate(template, context) };
}
