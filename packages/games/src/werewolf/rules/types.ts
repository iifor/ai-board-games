import type { PendingDeath, WerewolfState } from '../state';
import type { WerewolfContext } from './context';

/** 夜间结算的中间结果：各结算步骤依次在此基础上追加死亡或修改状态 */
export interface NightTally {
  readonly state: WerewolfState;
  readonly deaths: readonly PendingDeath[];
}

export type NightStep = (ctx: WerewolfContext, tally: NightTally) => NightTally;

/** 天亮公布的中间结果：deaths 是本次公布的死者，notes 会接在死讯之后一起播报 */
export interface DawnDraft {
  readonly state: WerewolfState;
  readonly deaths: readonly PendingDeath[];
  readonly notes: readonly string[];
}

export type DawnStep = (ctx: WerewolfContext, draft: DawnDraft) => DawnDraft;
