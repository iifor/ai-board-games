import { z } from 'zod';
import type { ExecEnv } from '../runtime/env';
import type { SpeakPhase } from '../spec/phases';
import type { RequestDraft } from './types';

export function listenerDrafts(env: ExecEnv, phase: SpeakPhase<unknown, unknown>, speaker: number, boundary: number): RequestDraft[] {
  const ctx = env.ctx();
  const drafts: RequestDraft[] = [];
  for (const [name, declaration] of Object.entries(phase.declarations ?? {})) {
    if (!declaration.listenerPrompt) continue;
    for (const seat of env.s.seats) {
      if (seat.seat === speaker || !declaration.allowed(ctx, seat)) continue;
      drafts.push({
        slot: `listen:${boundary}:${name}:${seat.seat}`, seat: seat.seat, action: 'act',
        template: declaration.listenerPrompt, vars: { declaration: name, speaker, opening: boundary === 0 ? 1 : 0 },
        legalTargets: [seat.seat],
      });
    }
  }
  return drafts;
}

export function listenerSchema(seat: number) {
  return z.object({ targets: z.array(z.literal(seat)).max(1).describe('选择自己的座号表示发动；空数组表示放弃') });
}
