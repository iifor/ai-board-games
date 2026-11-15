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

/** 发言阶段没有用 speechOutput 登记目标字数（自定义 output schema）时，{{turn.maxChars}} 渲染的默认值 */
export const DEFAULT_SPEECH_MAX_CHARS = 150;

/** speechOutput 登记的目标字数（schema → max）：字数只在 speechOutput({ max }) 写一次，提示词通过 {{turn.maxChars}} 读取 */
const speechLimits = new WeakMap<ZodType, number>();

/**
 * 发言阶段的标准输出：{ speech }。
 * max 是没有玩家篇幅设置时的提示词建议，完整发言按原文保留。
 */
export function speechOutput(options: { readonly max: number; readonly min?: number }): ZodType<SpeechOutput> {
  if (!Number.isInteger(options.max) || options.max < 1) throw new Error(`speechOutput 的 max 必须是正整数，收到 ${options.max}`);
  const schema = z.object({
    speech: z.string().trim().min(options.min ?? 1).describe('发言内容'),
  });
  speechLimits.set(schema, options.max);
  return schema;
}

/** 读取 speechOutput 登记的目标字数；不是由 speechOutput 构造的 schema 返回 null */
export function speechMaxOf(schema: ZodType): number | null {
  return speechLimits.get(schema) ?? null;
}
