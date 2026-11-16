import type { StageLayout } from '@battle/shared';
import { useCallback, useState } from 'react';
import { NARROW_STAGE_MAX_WIDTH } from '../constants';
import { recordPanelsOpenByDefault } from '../utils';

const viewportWidth = () => (typeof window === 'undefined' ? 0 : window.innerWidth);
const isNarrow = () => viewportWidth() <= NARROW_STAGE_MAX_WIDTH;

/**
 * 舞台两侧的对局记录与发言记录：打开时按窗口宽度决定是否默认展开；
 * 窄屏上两者都是底部抽屉，一次只开一个，打开一个就收起另一个。
 */
export function useRecordPanels(layout: StageLayout) {
  const [panels, setPanels] = useState(() => {
    const open = recordPanelsOpenByDefault(layout, viewportWidth());
    return { feed: open, speech: open };
  });
  const toggle = useCallback((panel: 'feed' | 'speech') => setPanels((current) => {
    const open = !current[panel];
    return open && isNarrow() ? { feed: false, speech: false, [panel]: true } : { ...current, [panel]: open };
  }), []);
  const toggleFeed = useCallback(() => toggle('feed'), [toggle]);
  const toggleSpeech = useCallback(() => toggle('speech'), [toggle]);
  const closeFeed = useCallback(() => setPanels((current) => ({ ...current, feed: false })), []);
  const closeSpeech = useCallback(() => setPanels((current) => ({ ...current, speech: false })), []);
  return { feedOpen: panels.feed, speechOpen: panels.speech, toggleFeed, toggleSpeech, closeFeed, closeSpeech };
}
