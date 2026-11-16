import { z } from 'zod';

/** 只含数字的字符串转成数字；其余值原样交给后面的 schema 判定（"abc"、"3.5"、""、true 都会被拒绝） */
function digitsToNumber(value: unknown): unknown {
  return typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
}

/**
 * AI 输出里的座位号：整数，也接受 "3" 这样只含数字的字符串（模型经常把数字写成字符串）。
 * 转换发生在校验之前，合法目标检查拿到的仍是数字；生成的 JSON Schema 仍是 integer，模型看到的契约不变。
 * 需要更严的约束时传入 inner（如必须为正数）。
 */
export function seatNumber(inner: z.ZodNumber = z.number().int()) {
  return z.preprocess(digitsToNumber, inner);
}

/** 只能是指定座号（旁听声明只允许选择自己），同样接受只含数字的字符串 */
export function exactSeatNumber(seat: number) {
  return z.preprocess(digitsToNumber, z.literal(seat));
}
