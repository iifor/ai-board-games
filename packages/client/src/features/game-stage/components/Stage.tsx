import type { AudienceView, StageLayout } from '@battle/shared';
import { LAYOUTS } from '../layouts/registry';
import { describeEvent } from '../playback/describe';
import type { StreamItem } from '../types';
import { StageCenter } from './StageCenter';

interface StageProps {
  readonly layout: StageLayout;
  readonly view: AudienceView | null;
  readonly current: StreamItem | null;
}

/** 按游戏声明的布局渲染座位，中央放阶段、计票等舞台内容 */
export function Stage({ layout, view, current }: StageProps) {
  if (!view) return <p className="stage-waiting">等待对局开始…</p>;
  const Layout = LAYOUTS[layout];
  const speaking = current ? describeEvent(current.event).speaker : null;
  return <Layout view={view} speaking={speaking} center={<StageCenter view={view} current={current} />} />;
}
