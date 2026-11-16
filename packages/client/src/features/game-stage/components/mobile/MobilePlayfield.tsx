import type { AudienceView, StageLayout } from '@battle/shared';
import { useFollowSpeech } from '../../hooks/useFollowSpeech';
import { describeEvent } from '../../playback/describe';
import type { SegmentControl } from '../../playback/segment';
import type { StreamItem } from '../../types';
import { SubtitleBar } from '../SubtitleBar';
import { VoteBoard } from '../VoteBoard';
import { MobileRing } from './MobileRing';
import { MobileSpeaker } from './MobileSpeaker';
import { MobileVersus } from './MobileVersus';
import './MobilePlayfield.css';

interface MobilePlayfieldProps {
  readonly layout: StageLayout;
  readonly view: AudienceView | null;
  readonly current: StreamItem | null;
  readonly played: readonly StreamItem[];
  readonly control: SegmentControl | null;
  readonly selected?: number | null;
  /** 不传时座位只展示、不可点（后台导入试播） */
  readonly onSelect?: ((seat: number) => void) | undefined;
}

const ignore = () => {};

/**
 * 手机舞台的座位区与发言卡（对局舞台与后台导入试播共用）：座位区占满剩余高度，发言卡高度固定、内部跟读滚动，
 * 两者互不挤压——换段时座位不会因为发言长短跳动。返回两个兄弟元素，由外层布局摆放。
 */
export function MobilePlayfield({ layout, view, current, played, control, selected = null, onSelect }: MobilePlayfieldProps) {
  const item = current ?? played.at(-1) ?? null;
  const card = useFollowSpeech<HTMLDivElement>(item?.event.seq, control);
  const speaking = current ? describeEvent(current.event).speaker : null;
  const center = view ? <MobileSpeaker view={view} item={current} /> : null;
  const vote = current?.event.kind === 'vote_tallied' ? current.event : null;
  const seats = { speaking, selected, onSelect: onSelect ?? ignore, center };
  return (
    <>
      <main className="mobile-stage-arena">
        {!view ? <p className="stage-waiting">等待对局开始…</p>
          : layout === 'versus' ? <MobileVersus view={view} {...seats} /> : <MobileRing view={view} {...seats} />}
      </main>
      <div ref={card} className="mobile-stage-card">
        {vote && view ? <VoteBoard key={vote.seq} event={vote} view={view} /> : <SubtitleBar item={item} view={view} control={control} />}
      </div>
    </>
  );
}
