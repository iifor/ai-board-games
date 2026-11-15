import type { ComputeOutcome } from '@battle/engine';
import { joinNotices, line } from '../announcements';
import { specialDawnSteps } from '../special';
import type { PendingDeath, WerewolfState } from '../state';
import { boardConfig } from './board';
import type { WerewolfContext } from './context';
import type { DawnDraft } from './types';
import { wolvesSweep } from './victory';

// 天亮公布管线：消费 special/index.ts 登记表中的公布步骤（禁言、熊的咆哮）；特殊角色模块不得引用本文件。

/** 只计狼刀（狼队与大灰狼）时狼人是否已经屠边：此时锁定狼人胜利 */
function wolfKillLocksWin(ctx: WerewolfContext, deaths: readonly PendingDeath[]): boolean {
  const victims = deaths.filter((death) => death.cause === 'wolf').map((death) => death.seat);
  if (victims.length === 0) return false;
  return wolvesSweep(ctx, ctx.seats.alive().except(...victims).list());
}

/** 天亮公布死讯并让死者出局；特殊角色的公布信息按登记顺序接在死讯之后 */
export function announceDawn(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  const deaths = ctx.state.pendingDeaths;
  const winnerLock = wolfKillLocksWin(ctx, deaths) ? 'werewolf' : ctx.state.winnerLock;
  const initial: DawnDraft = {
    state: { ...ctx.state, pendingDeaths: [], lastNightDeaths: deaths.map((death) => death.seat), winnerLock },
    deaths,
    notes: [],
  };
  const { state, notes, effects = [] } = specialDawnSteps.reduce<DawnDraft>((draft, step) => step(ctx, draft), initial);
  const wake = ctx.round === 1 && boardConfig(ctx).sheriff ? '' : line(ctx, 'wake');
  const news = deaths.length
    ? line(ctx, 'nightDeaths', { 座位名单: deaths.map((death) => `${death.seat}号`).join('、') })
    : line(ctx, 'peaceful');
  return {
    state,
    log: [{ kind: 'narration', text: joinNotices(wake, news, ...notes) }, ...effects],
    eliminate: deaths.map((death) => ({ seat: death.seat, reason: '昨晚死亡', cause: death.cause })),
  };
}
