import type { GameResult, MatchSummaryDto } from '@battle/shared';
import { useState, type ReactNode } from 'react';
import { debateTopicOf } from '../../layouts/debateTopic';
import type { usePlayback } from '../../hooks/usePlayback';
import { describeEvent } from '../../playback/describe';
import type { PlaybackOptions, StreamState } from '../../types';
import { periodOf, seatOf, speechesOfSeat } from '../../utils';
import { ResultPanel } from '../ResultPanel';
import { StageBackdrop } from '../StageBackdrop';
import { StageError } from '../StageError';
import { SubtitleBar } from '../SubtitleBar';
import { VoteBoard } from '../VoteBoard';
import { MobileControls } from './MobileControls';
import { MobileRing } from './MobileRing';
import { MobileSheet, type SheetTab } from './MobileSheet';
import { MobileSpeaker } from './MobileSpeaker';
import { MobileStatus } from './MobileStatus';
import { MobileTopBar } from './MobileTopBar';
import { MobileVersus } from './MobileVersus';
import './MobileStage.css';

interface MobileStageProps {
  readonly summary: MatchSummaryDto;
  readonly playback: ReturnType<typeof usePlayback>;
  readonly stream: Pick<StreamState, 'connection' | 'error' | 'ended'> & { readonly retry: () => void };
  readonly options: PlaybackOptions;
  readonly onOptions: (next: PlaybackOptions) => void;
  readonly finished: boolean;
  readonly replay: boolean;
  /** 观战视角切换（放进顶栏的更多菜单） */
  readonly perspective: ReactNode;
  /** 有终局结果时的对话框控制；没有结果为 null */
  readonly result: { readonly value: GameResult; readonly open: boolean; readonly show: () => void; readonly hide: () => void; readonly onReplay: () => void } | null;
}

/**
 * 手机舞台：单屏 App 布局，自上而下是顶栏（阶段）、局势条、座位舞台、当前发言卡、记录抽屉、控制栏。
 * 数据与桌面舞台共用（播放、ack、终局），只换展示；发言卡是唯一的当前文本，不再叠加底部逐句字幕。
 */
export function MobileStage({ summary, playback, stream, options, onOptions, finished, replay, perspective, result }: MobileStageProps) {
  const [sheet, setSheet] = useState<{ open: boolean; tab: SheetTab }>({ open: false, tab: 'speech' });
  const [selected, setSelected] = useState<number | null>(null);
  const { view, current, played, control } = playback;
  const item = current ?? played.at(-1) ?? null;
  const items = current ? [...played, current] : played;
  const speaking = current ? describeEvent(current.event).speaker : null;
  const seat = seatOf(view, selected);
  const select = (next: number) => {
    setSelected(next);
    setSheet({ open: true, tab: 'seat' });
  };
  const debate = summary.layout === 'versus';
  const topic = debate && view ? debateTopicOf(view)?.title : undefined;
  const center = view ? <MobileSpeaker view={view} item={current} /> : null;
  const vote = current?.event.kind === 'vote_tallied' ? current.event : null;
  return (
    <div className="mobile-stage" data-game={summary.gameKey} data-period={periodOf(view)}>
      <StageBackdrop gameKey={summary.gameKey} period={periodOf(view)} />
      <MobileTopBar summary={summary} view={view} event={item?.event} connection={stream.connection} ended={finished} replay={replay}>
        {perspective}
      </MobileTopBar>
      {topic ? <p className="mobile-stage-topic">{topic}</p> : null}
      {!debate && view ? <MobileStatus view={view} /> : null}
      {stream.error ? <StageError message={stream.error} onRetry={stream.connection === 'lost' ? stream.retry : null} /> : null}
      <main className="mobile-stage-arena">
        {!view ? <p className="stage-waiting">等待对局开始…</p>
          : debate ? <MobileVersus view={view} speaking={speaking} selected={selected} onSelect={select} center={center} />
            : <MobileRing view={view} speaking={speaking} selected={selected} onSelect={select} center={center} />}
      </main>
      <div className="mobile-stage-card">
        {vote && view ? <VoteBoard key={vote.seq} event={vote} view={view} /> : <SubtitleBar item={item} view={view} control={control} />}
      </div>
      <MobileSheet open={sheet.open} tab={sheet.tab} items={items} history={played} seat={seat} seatSpeeches={seat ? speechesOfSeat(played, seat.seat) : []}
        onTab={(tab) => setSheet({ open: true, tab })} onToggle={() => setSheet((now) => ({ ...now, open: !now.open }))} />
      <MobileControls options={options} finished={finished} sheetOpen={sheet.open} onChange={onOptions}
        onToggleSheet={() => setSheet((now) => ({ ...now, open: !now.open }))}
        onShowResult={result && !result.open ? result.show : undefined} />
      {result?.open && view ? <ResultPanel result={result.value} view={view} summary={summary} onReplay={result.onReplay} onClose={result.hide} /> : null}
    </div>
  );
}
