import type { GameResult, MatchSummaryDto } from '@battle/shared';
import { useState, type ReactNode } from 'react';
import type { usePlayback } from '../../hooks/usePlayback';
import type { PlaybackOptions, StreamState } from '../../types';
import { periodOf, seatOf, speechesOfSeat } from '../../utils';
import { AudioUnlockPrompt } from '../AudioUnlockPrompt';
import { ResultPanel } from '../ResultPanel';
import { StageBackdrop } from '../StageBackdrop';
import { StageError } from '../StageError';
import { debateTopicOf } from '../../layouts/debateTopic';
import { MobileControls } from './MobileControls';
import { MobilePlayfield } from './MobilePlayfield';
import { MobileSheet, type SheetTab } from './MobileSheet';
import { MobileStatus } from './MobileStatus';
import { MobileTopBar } from './MobileTopBar';
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
 * 手机舞台：单屏 App 布局，竖屏自上而下是顶栏（阶段）、局势条、座位舞台、当前发言卡、记录抽屉、控制栏；
 * 横屏或矮窗口改为左右两栏（左边座位舞台，右边发言卡、抽屉与控制栏），座位区不会被压没。
 * 数据与桌面舞台共用（播放、ack、终局），只换展示；发言卡是唯一的当前文本，不再叠加底部逐句字幕。
 */
export function MobileStage({ summary, playback, stream, options, onOptions, finished, replay, perspective, result }: MobileStageProps) {
  const [sheet, setSheet] = useState<{ open: boolean; tab: SheetTab }>({ open: false, tab: 'speech' });
  const [selected, setSelected] = useState<number | null>(null);
  const { view, current, played, control } = playback;
  const item = current ?? played.at(-1) ?? null;
  const items = current ? [...played, current] : played;
  const seat = seatOf(view, selected);
  const select = (next: number) => {
    setSelected(next);
    setSheet({ open: true, tab: 'seat' });
  };
  const debate = summary.layout === 'versus';
  const topic = debate && view ? debateTopicOf(view)?.title : undefined;
  return (
    <div className="mobile-stage" data-game={summary.gameKey} data-period={periodOf(view)}>
      <StageBackdrop gameKey={summary.gameKey} period={periodOf(view)} />
      <MobileTopBar summary={summary} view={view} event={item?.event} connection={stream.connection} ended={finished} replay={replay}>
        {perspective}
      </MobileTopBar>
      {topic ? <p className="mobile-stage-topic">{topic}</p> : null}
      {!debate && view ? <MobileStatus view={view} /> : null}
      {stream.error ? <StageError message={stream.error} onRetry={stream.connection === 'lost' ? stream.retry : null} /> : null}
      <AudioUnlockPrompt muted={options.muted} />
      <MobilePlayfield layout={summary.layout} view={view} current={current} played={played} control={control} selected={selected} onSelect={select} />
      <div className="mobile-stage-sheet-slot">
        <MobileSheet open={sheet.open} tab={sheet.tab} items={items} history={played} seat={seat} seatSpeeches={seat ? speechesOfSeat(played, seat.seat) : []}
          onTab={(tab) => setSheet({ open: true, tab })} onToggle={() => setSheet((now) => ({ ...now, open: !now.open }))} />
      </div>
      <MobileControls options={options} finished={finished} sheetOpen={sheet.open} onChange={onOptions}
        onToggleSheet={() => setSheet((now) => ({ ...now, open: !now.open }))}
        onShowResult={result && !result.open ? result.show : undefined} />
      {result?.open && view ? <ResultPanel result={result.value} view={view} summary={summary} onReplay={result.onReplay} onClose={result.hide} /> : null}
    </div>
  );
}
