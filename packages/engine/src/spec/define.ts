import { z, type ZodType } from 'zod';
import { parseTemplate, type PromptTemplate } from '../prompt/template';
import type { SpeechOutput } from './phases';
import type { GameSpec } from './types';

/** 编写游戏的入口：只做类型推断，S 来自 state.schema，P 来自 params */
export function defineGame<S, P = Record<string, never>>(spec: GameSpec<S, P>): GameSpec<S, P> {
  return spec;
}

/** 解析一组模板；模板名即对象的 key，语法错误在 import 时就会抛出 */
export function definePrompts<const T extends Readonly<Record<string, string>>>(
  sources: T,
): { readonly [K in keyof T]: PromptTemplate } {
  const entries = Object.entries(sources).map(([name, source]) => [name, parseTemplate(name, source)] as const);
  return Object.fromEntries(entries) as { readonly [K in keyof T]: PromptTemplate };
}

/** 发言阶段的标准输出：{ speech } */
export function speechOutput(options: { readonly max: number; readonly min?: number }): ZodType<SpeechOutput> {
  return z.object({ speech: z.string().trim().min(options.min ?? 1).max(options.max) });
}
