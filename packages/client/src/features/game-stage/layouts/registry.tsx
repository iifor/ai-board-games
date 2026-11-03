import type { StageLayout } from '@battle/shared';
import type { ComponentType } from 'react';
import { CircleLayout } from './CircleLayout';
import type { LayoutProps } from './types';
import { VersusLayout } from './VersusLayout';

export interface LayoutEntry {
  readonly Component: ComponentType<LayoutProps>;
  /** 布局有座位坐标、会播选票飞行：舞台据此让票板等选票落地后再长条 */
  readonly ballotFlight: boolean;
}

/** 游戏声明的 layout → 布局组件；新增布局在此登记 */
export const LAYOUTS: Readonly<Record<StageLayout, LayoutEntry>> = {
  versus: { Component: VersusLayout, ballotFlight: false },
  circle: { Component: CircleLayout, ballotFlight: true },
};
