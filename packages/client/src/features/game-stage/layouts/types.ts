import type { AudienceView } from '@battle/shared';
import type { ReactNode } from 'react';

export interface LayoutProps {
  readonly view: AudienceView;
  /** 正在说话的座位 */
  readonly speaking: number | null;
  /** 舞台中央的内容（字幕等） */
  readonly center: ReactNode;
}
