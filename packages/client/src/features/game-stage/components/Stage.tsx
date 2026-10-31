import type { AudienceView, StageLayout } from '@battle/shared';
import { LAYOUTS } from '../layouts/registry';
import { describeEvent } from '../playback/describe';
import type { StreamItem } from '../types';
import { Subtitle } from './Subtitle';

interface StageProps {
  readonly layout: StageLayout;
  readonly view: AudienceView | null;
  readonly current: StreamItem | null;
}

/** 按游戏声明的布局渲染座位，中间放字幕 */
export function Stage({ layout, view, current }: StageProps) {
  if (!view) return <Subtitle item={null} view={null} />;
  const Layout = LAYOUTS[layout];
  const speaking = current ? describeEvent(current.event).speaker : null;
  return <Layout view={view} speaking={speaking} center={<Subtitle item={current} view={view} />} />;
}
