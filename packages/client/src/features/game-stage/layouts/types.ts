import type { AudienceView } from '@battle/shared';
import type { ReactNode } from 'react';

export interface LayoutProps {
  readonly view: AudienceView;
  /** 正在说话的座位 */
  readonly speaking: number | null;
  /** 舞台中央的内容（立绘、票板等） */
  readonly center: ReactNode;
  /** 座位上额外的徽章（如评委的判定），由舞台从已播放事件算出 */
  readonly badges?: Readonly<Record<number, readonly string[]>> | undefined;
}
