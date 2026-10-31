import type { ComputeOutcome } from '@battle/engine';
import { bearRoarNote } from '../special/bearTamer';
import { publishSilence } from '../special/silenceElder';
import type { PendingDeath, WerewolfState } from '../state';
import type { WerewolfContext } from './context';
import type { DawnDraft, DawnStep } from './types';
import { sideEliminated } from './victory';

/** 天亮时与死讯一起公布的信息（禁言、熊的咆哮），按顺序接在死讯之后 */
const DAWN_STEPS: readonly DawnStep[] = [publishSilence, bearRoarNote];

/** 只计狼刀（狼队与大灰狼）时狼人是否已经屠边：此时锁定狼人胜利 */
function wolfKillLocksWin(ctx: WerewolfContext, deaths: readonly PendingDeath[]): boolean {
  const victims = deaths.filter((death) => death.cause === 'wolf').map((death) => death.seat);
  if (victims.length === 0) return false;
  return sideEliminated(ctx, ctx.seats.alive().except(...victims).list());
}

/** 天亮公布死讯并让死者出局 */
export function announceDawn(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  const deaths = ctx.state.pendingDeaths;
  const winnerLock = wolfKillLocksWin(ctx, deaths) ? 'werewolf' : ctx.state.winnerLock;
  const initial: DawnDraft = {
    state: { ...ctx.state, pendingDeaths: [], lastNightDeaths: deaths.map((death) => death.seat), winnerLock },
    deaths,
    notes: [],
  };
  const { state, notes } = DAWN_STEPS.reduce<DawnDraft>((draft, step) => step(ctx, draft), initial);
  const news = deaths.length
    ? `天亮了，昨晚死亡的是：${deaths.map((death) => `${death.seat}号`).join('、')}。`
    : '天亮了，昨晚是平安夜。';
  return {
    state,
    log: [{ kind: 'narration', text: [news, ...notes].join('') }],
    eliminate: deaths.map((death) => ({ seat: death.seat, reason: '昨晚死亡', cause: death.cause })),
  };
}
