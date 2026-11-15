import type { SpeakPhase } from '@battle/engine';
import { line } from '../announcements';
import { werewolfPrompts } from '../prompts';
import { canSelfDestruct } from '../rules/death';
import type { WerewolfParams, WerewolfState } from '../state';

export const wolfDeclarations = {
  selfDestruct: {
    label: '自爆',
    listenerPrompt: werewolfPrompts.selfDestructDecision,
    allowed: (ctx, seat) => canSelfDestruct(seat) && !ctx.state.pendingDeaths.some(death => death.seat === seat.seat),
    describe: (ctx, seat) => {
      const text = line(ctx, 'selfDestruct', { 座号: seat.seat });
      const override = ctx.announcementOverrides?.selfDestruct;
      return override && !override.includes('{座号}') ? `${seat.seat}号自爆。${text}` : text;
    },
  },
} satisfies NonNullable<SpeakPhase<WerewolfState, WerewolfParams>['declarations']>;
