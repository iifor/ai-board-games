import type { ComputeOutcome, PromptTemplate, Seat, VoteBonus } from '@battle/engine';
import type { WerewolfPhases, WerewolfTriggers } from '../phases/types';
import type { WerewolfContext } from '../rules/context';
import type { DawnStep, NightStep } from '../rules/types';
import type { WerewolfState } from '../state';

// 特殊角色模块的描述符：每个 special/<role>.ts 导出一个，由 special/index.ts 按口径顺序汇总成登记表，
// 核心流程（结算管线、触发器、spec）只读取登记表，不引用具体模块。
// 角色的阵营、屠边类别与特性在 roles.ts 的目录中登记，这里只登记身份模板。

/** 胜负判定的钩子（rules/victory.ts） */
export interface VictoryHooks {
  /** 该座位最终所属的一方（如丘比特跟随情侣）：MVP 平票时据此判断是否属于胜利一方；不干预时返回 null */
  side?(ctx: WerewolfContext, seat: Seat): 'good' | 'werewolf' | null;
  /** 暂缓判定（如随狼队出局的隐狼尚未结算） */
  defer?(ctx: WerewolfContext): boolean;
  /** 终局说明末尾附加的个人结果（如混血儿跟随主人）；本局没有该角色时返回 null */
  note?(ctx: WerewolfContext, winner: string): string | null;
}

/** 放逐环节的钩子（rules/day.ts） */
export interface ExileHooks {
  /** 放逐投票的额外票（如乌鸦的诅咒） */
  bonus?(ctx: WerewolfContext): VoteBonus[];
  /** 额外票的来源说明（如"乌鸦的诅咒"）：放逐结算播报得票构成时使用，缺省写"额外票" */
  readonly bonusLabel?: string;
  /** 被放逐者免于出局的特殊结算（如最后一名狼人是魔狼时翻牌存活）；不干预时返回 null */
  hold?(ctx: WerewolfContext, target: Seat, state: WerewolfState): ComputeOutcome<WerewolfState> | null;
}

export interface SpecialDescriptor {
  /** 模块名（与文件名一致），只用于登记表的错误提示 */
  readonly key: string;
  /** 本模块的全部模板（含身份模板），登记到 spec.prompts */
  readonly prompts?: Readonly<Record<string, PromptTemplate>>;
  /** 角色 key → 身份模板（L3）；每个角色目录中的角色都必须在某处登记 */
  readonly identities?: Readonly<Record<string, PromptTemplate>>;
  readonly phases?: WerewolfPhases;
  /** 殉情类触发器：遗言之后、所有开枪 / 带人之前 */
  readonly linkTriggers?: WerewolfTriggers;
  /** 出局后的其他处理：猎人开枪之后、移交警徽之前 */
  readonly deathTriggers?: WerewolfTriggers;
  /** 夜间结算步骤（执行顺序在 special/index.ts 中登记） */
  readonly nightStep?: NightStep;
  /** 天亮公布时接在死讯之后的步骤 */
  readonly dawnStep?: DawnStep;
  readonly victory?: VictoryHooks;
  readonly exile?: ExileHooks;
}
