import type { AudienceView, StageLayout } from '@battle/shared';
import { LAYOUTS } from '../layouts/registry';
import { describeEvent } from '../playback/describe';
import type { StreamItem } from '../types';
import { judgeBadges } from '../utils';
import { StageCenter } from './StageCenter';

interface StageProps {
  readonly layout: StageLayout;
  readonly view: AudienceView | null;
  readonly current: StreamItem | null;
  readonly played: readonly StreamItem[];
}

/** 按游戏声明的布局渲染座位；中央放立绘、票板等舞台内容，座位徽章来自已播放的事件 */
export function Stage({ layout, view, current, played }: StageProps) {
  if (!view) return <p className="stage-waiting">等待对局开始…</p>;
  const Layout = LAYOUTS[layout];
  const speaking = current ? describeEvent(current.event).speaker : null;
  return (
    <Layout
      view={view}
      speaking={speaking}
      badges={judgeBadges(played)}
      center={<StageCenter view={view} current={current} played={played} />}
    />
  );
}
