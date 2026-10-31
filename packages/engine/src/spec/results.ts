import type { PhaseResult, PhaseResultKind } from './context';

type ResultOf<K extends PhaseResultKind> = Extract<PhaseResult, { readonly kind: K }>;

/** 读取某阶段的结果并校验类型；阶段未完成或类型不符视为规则写错 */
export function expectResult<K extends PhaseResultKind>(
  results: Readonly<Record<string, PhaseResult>>,
  phaseId: string,
  kind: K,
): ResultOf<K> {
  const result = results[phaseId];
  if (!result || result.kind !== kind) {
    throw new Error(`阶段 "${phaseId}" 没有 ${kind} 类型的结果`);
  }
  return result as ResultOf<K>;
}

export function findResult<K extends PhaseResultKind>(
  results: Readonly<Record<string, PhaseResult>>,
  phaseId: string,
  kind: K,
): ResultOf<K> | null {
  const result = results[phaseId];
  return result && result.kind === kind ? (result as ResultOf<K>) : null;
}
