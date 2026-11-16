import type { StageLayout } from '@battle/shared';
import { useCallback, useState } from 'react';
import { recordPanelsOpenByDefault } from '../utils';

const viewportWidth = () => (typeof window === 'undefined' ? 0 : window.innerWidth);

/** 桌面舞台两侧的对局记录与发言记录：打开舞台时按窗口宽度决定是否默认展开，之后各自独立开关（手机舞台用自己的记录抽屉） */
export function useRecordPanels(layout: StageLayout) {
  const [panels, setPanels] = useState(() => {
    const open = recordPanelsOpenByDefault(layout, viewportWidth());
    return { feed: open, speech: open };
  });
  const toggleFeed = useCallback(() => setPanels((current) => ({ ...current, feed: !current.feed })), []);
  const toggleSpeech = useCallback(() => setPanels((current) => ({ ...current, speech: !current.speech })), []);
  const closeFeed = useCallback(() => setPanels((current) => ({ ...current, feed: false })), []);
  const closeSpeech = useCallback(() => setPanels((current) => ({ ...current, speech: false })), []);
  return { feedOpen: panels.feed, speechOpen: panels.speech, toggleFeed, toggleSpeech, closeFeed, closeSpeech };
}
