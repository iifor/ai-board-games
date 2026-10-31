import type { LogDraft, SeatReassignment } from '@battle/engine';
import type { PendingDeath, WerewolfState } from '../state';
import type { WerewolfContext } from './context';

/** 夜间结算的中间结果：各结算步骤依次在此基础上追加死亡或修改状态 */
export interface NightTally {
  readonly state: WerewolfState;
  readonly deaths: readonly PendingDeath[];
  /** 结算中改变身份的座位（如被种狼感染） */
  readonly reassign?: readonly SeatReassignment[];
  /** 结算时私下告知的信息（如大树被刀中一次） */
  readonly log?: readonly LogDraft[];
}

export type NightStep = (ctx: WerewolfContext, tally: NightTally) => NightTally;

/** 天亮公布的中间结果：deaths 是本次公布的死者，notes 会接在死讯之后一起播报 */
export interface DawnDraft {
  readonly state: WerewolfState;
  readonly deaths: readonly PendingDeath[];
  readonly notes: readonly string[];
}

export type DawnStep = (ctx: WerewolfContext, draft: DawnDraft) => DawnDraft;
