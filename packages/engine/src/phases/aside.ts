import { z } from 'zod';
import type { ExecEnv } from '../runtime/env';
import type { PendingRequest } from '../runtime/types';
import type { AsideSpec } from '../spec/phases';

export const DEFAULT_ASIDE_MAX_CHARS = 60;

/** 输出契约里的可选 aside 字段：模型自己决定说不说，说明文字就是给它的引导 */
export function asideField(spec: AsideSpec) {
  const max = spec.maxChars ?? DEFAULT_ASIDE_MAX_CHARS;
  return z.string().max(max).nullable().optional().describe(
    `可选：此刻想对观众说的一句心里话（第一人称、口语，不超过 ${max} 字）。平常直接省略；`
    + '只有你判断这一步有博弈、值得交代为什么这么赌时才说。只有观众听得到，其他玩家看不到。',
  );
}

/** 把模型给出的心里话写入观战频道；空白或没给就什么都不写。在行动 / 选票日志之前调用，观众先听心里话再看结果 */
export function logAside(env: ExecEnv, spec: AsideSpec | undefined, pending: PendingRequest, value: unknown): void {
  if (!spec) return;
  const aside = (value as { readonly aside?: string | null }).aside?.trim();
  if (!aside) return;
  env.log({ kind: 'speech', seat: pending.seat, purpose: 'aside', text: aside, channel: 'spectator' }, [pending.id]);
}
