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

/**
 * 发言长度容差：schema 的硬上限是提示词所述字数的 2 倍。
 * 模型略超目标字数的发言仍然可用，不该因为重试、兜底而被整段丢弃；超过硬上限才算不合法。
 */
export const SPEECH_LENGTH_TOLERANCE = 2;

/** 发言阶段没有用 speechOutput 登记目标字数（自定义 output schema）时，{{turn.maxChars}} 渲染的默认值 */
export const DEFAULT_SPEECH_MAX_CHARS = 150;

/** speechOutput 登记的目标字数（schema → max）：字数只在 speechOutput({ max }) 写一次，提示词通过 {{turn.maxChars}} 读取 */
const speechLimits = new WeakMap<ZodType, number>();

/**
 * 发言阶段的标准输出：{ speech }。
 * max 是提示词告诉模型的目标字数（引擎注入为轮次变量，模板以 {{turn.maxChars}} 引用），schema 的硬上限为其 SPEECH_LENGTH_TOLERANCE 倍。
 */
export function speechOutput(options: { readonly max: number; readonly min?: number }): ZodType<SpeechOutput> {
  if (!Number.isInteger(options.max) || options.max < 1) throw new Error(`speechOutput 的 max 必须是正整数，收到 ${options.max}`);
  const hardMax = options.max * SPEECH_LENGTH_TOLERANCE;
  const schema = z.object({
    speech: z.string().trim().min(options.min ?? 1).max(hardMax).describe(`发言内容，目标不超过 ${options.max} 字`),
  });
  speechLimits.set(schema, options.max);
  return schema;
}

/** 读取 speechOutput 登记的目标字数；不是由 speechOutput 构造的 schema 返回 null */
export function speechMaxOf(schema: ZodType): number | null {
  return speechLimits.get(schema) ?? null;
}
