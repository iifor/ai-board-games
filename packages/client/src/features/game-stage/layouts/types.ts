import type { AudienceView } from '@battle/shared';
import type { ReactNode } from 'react';
import type { VoteFlight } from '../animation/ballotFlight';
import type { SeatSelectHandler } from '../types';
import type { StagePeriod } from '../utils';

export interface LayoutProps {
  readonly view: AudienceView;
  /** 正在说话的座位 */
  readonly speaking: number | null;
  /** 舞台中央的内容（立绘、票板等） */
  readonly center: ReactNode;
  /** 座位上额外的徽章（如评委的判定），由舞台从已播放事件算出 */
  readonly badges?: Readonly<Record<number, readonly string[]>> | undefined;
  /** 昼夜：夜晚时没有在行动的存活座位显示为闭眼 */
  readonly period?: StagePeriod | undefined;
  /** 正在播放的计票：选票从投票者座位飞向目标座位；布局没有座位坐标时忽略 */
  readonly vote?: VoteFlight | null | undefined;
  /** 点击 / 回车座位卡片：打开该座位的资料弹层；没有时卡片只展示 */
  readonly onSeatSelect?: SeatSelectHandler | undefined;
  /** 弹层已打开的座位，卡片描边高亮 */
  readonly selectedSeat?: number | null | undefined;
}
