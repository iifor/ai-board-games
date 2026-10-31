import type { StageLayout } from '@battle/shared';
import type { ComponentType } from 'react';
import { CircleLayout } from './CircleLayout';
import type { LayoutProps } from './types';
import { VersusLayout } from './VersusLayout';

/** 游戏声明的 layout → 布局组件；新增布局在此登记 */
export const LAYOUTS: Readonly<Record<StageLayout, ComponentType<LayoutProps>>> = {
  versus: VersusLayout,
  circle: CircleLayout,
};
