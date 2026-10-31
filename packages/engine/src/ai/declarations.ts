import { z, type ZodType } from 'zod';
import { SpecError } from '../errors';
import type { ExecEnv } from '../runtime/env';
import { fireEvent } from '../runtime/triggers';
import type { Seat } from '../runtime/types';
import type { DeclarationSpec, SpeakPhase } from '../spec/phases';

type Phase = SpeakPhase<unknown, unknown>;

export interface DeclaredOutput {
  readonly declare?: string;
}

function allowedDeclarations(env: ExecEnv, phase: Phase, seat: Seat): [string, DeclarationSpec<unknown, unknown>][] {
  const ctx = env.ctx();
  return Object.entries(phase.declarations ?? {}).filter(([, declaration]) => declaration.allowed(ctx, seat));
}

/** 发言阶段的输出 schema：为有权声明的座位追加可选的 declare 字段，其余座位保持原样 */
export function speakSchema(env: ExecEnv, phase: Phase, seat: Seat): ZodType {
  const allowed = allowedDeclarations(env, phase, seat);
  const [first, ...rest] = allowed.map(([key]) => key);
  if (first === undefined) return phase.output;
  if (!(phase.output instanceof z.ZodObject)) {
    throw new SpecError(env.game.spec.key, [`阶段 ${env.phaseId()} 声明了附加动作，output 必须是 z.object`]);
  }
  const meaning = allowed.map(([key, declaration]) => `${key}=${declaration.label}`).join('；');
  return phase.output.extend({
    declare: z.enum([first, ...rest]).optional().describe(`可选的附加动作，不需要时不要填写：${meaning}`),
  });
}

/** 发言保存后处理声明：公开记录并派发 action_declared 事件 */
export function applyDeclaration(env: ExecEnv, phase: Phase, seat: Seat, value: unknown): void {
  const action = (value as DeclaredOutput).declare;
  if (action === undefined) return;
  const declaration = phase.declarations?.[action];
  if (!declaration) throw new Error(`阶段 ${env.phaseId()} 没有附加动作 ${action}`);
  env.log({ kind: 'action', seat: seat.seat, action: declaration.label, targets: [], text: `宣布${declaration.label}` });
  fireEvent(env, { kind: 'action_declared', seat: seat.seat, action });
}
