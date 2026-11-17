import { speechOf, type MatchSummaryDto } from '@battle/shared';
import { useCallback, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { StatusView } from '../../../components/StatusView';
import { useAsync } from '../../../hooks/useAsync';
import { fetchMatch } from '../../../services/matches';
import { AudioUnlockPrompt } from '../components/AudioUnlockPrompt';
import { DebateTitle } from '../components/DebateTitle';
import { StageRecord } from '../components/StageRecord';
import { PlaybackControls } from '../components/PlaybackControls';
import { ResultPanel } from '../components/ResultPanel';
import { SeatPopover } from '../components/SeatPopover';
import { Stage } from '../components/Stage';
import { StageBackdrop } from '../components/StageBackdrop';
import { StageError } from '../components/StageError';
import { StageHud } from '../components/StageHud';
import { SubtitleBar } from '../components/SubtitleBar';
import { SentenceCaptions } from '../components/SentenceCaptions';
import { SHORTCUT_HINTS } from '../constants';
import { useMatchStream } from '../hooks/useMatchStream';
import { useAudienceSetting } from '../hooks/useAudienceSetting';
import { usePlayback } from '../hooks/usePlayback';
import { useRecordPanels } from '../hooks/useRecordPanels';
import { useNarrowStage } from '../hooks/useNarrowStage';
import { MobileStage } from '../components/mobile/MobileStage';
import { useResultDialog } from '../hooks/useResultDialog';
import { useStageShortcuts } from '../hooks/useStageShortcuts';
import type { PlaybackOptions, SeatSelection } from '../types';
import { periodOf, seatOf, speechesOfSeat } from '../utils';
import { isPlayerSpeech } from '../playback/speechTurns';
import { debateTopicOf } from '../layouts/debateTopic';
import './StagePage.css';

/**
 * 实时与回放共用舞台；当前发言居中，对局记录与发言记录停靠两侧（展开时舞台让出位置，窄屏为底部抽屉）。
 * 页面组合播放、舞台快捷键和悬浮座位资料。
 */
export function StagePage() {
  const matchId = useParams().matchId ?? '';
  const summary = useAsync(() => fetchMatch(matchId), [matchId]);
  if (summary.status === 'loading') return <StatusView kind="loading" />;
  if (summary.status === 'error') return <StatusView kind="error" message={summary.message} onRetry={summary.reload} />;
  return <StageViewer key={summary.data.id} summary={summary.data} />;
}

function StageViewer({ summary }: { readonly summary: MatchSummaryDto }) {
  const setting = useAudienceSetting(summary.id, summary.seats);
  const [options, setOptions] = useState<PlaybackOptions>({ speed: 1, paused: false, muted: summary.debug && summary.scripted });
  const seat = setting.seat;
  return <StageSession key={seat ?? 'god'} summary={summary} seat={seat} start={setting.afterSeq}
    options={options} setOptions={setOptions} switchMode={setting.switchMode} />;
}

interface SessionProps {
  readonly summary: MatchSummaryDto;
  readonly seat: number | null;
  readonly start: number;
  readonly options: PlaybackOptions;
  readonly setOptions: (options: PlaybackOptions) => void;
  readonly switchMode: (player: boolean, afterSeq: number) => void;
}

function StageSession({ summary, seat, start, options, setOptions, switchMode }: SessionProps) {
  const [session, setSession] = useState(0);
  const stream = useMatchStream(summary.id, session, seat, session === 0 ? start : 0);
  const debate = summary.layout === 'versus';
  const narrow = useNarrowStage();
  const { feedOpen, speechOpen, toggleFeed, toggleSpeech, closeFeed, closeSpeech } = useRecordPanels(summary.layout);
  const playback = usePlayback(stream.items, stream.ack, options);
  const finished = stream.ended && playback.pending === 0 && !playback.current;
  const resultDialog = useResultDialog(finished);
  const hasResult = finished && stream.result !== null;
  const toggleResult = resultDialog.open ? resultDialog.hide : resultDialog.show;
  useStageShortcuts({ options, finished, onChange: setOptions, onToggleFeed: toggleFeed, onToggleResult: hasResult ? toggleResult : undefined });
  const arenaRef = useRef<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState<SeatSelection | null>(null);
  const selectSeat = useCallback((seat: number, anchor: HTMLElement) => setSelected((prev) => (prev?.anchor === anchor ? prev : { seat, anchor })), []);
  const closeSeat = useCallback(() => setSelected(null), []);
  const selectedSeat = seatOf(playback.view, selected?.seat ?? null);
  // played 每次渲染都是新切片，缓存没有意义；弹层开着时才算
  const selectedSpeeches = selected ? speechesOfSeat(playback.played, selected.seat) : [];

  const gameKey = summary.gameKey;
  // 布局随对局概要一起返回，不依赖游戏目录接口：目录拉不到时辩论赛也不会被画成圆桌
  const layout = summary.layout;
  const period = periodOf(playback.view);
  const topicTitle = debate ? debateTopicOf(playback.view)?.title : undefined;
  // 播完后字幕栏停在最后一段（终局摘要），而不是回到"等待下一段"
  const subtitleItem = playback.current ?? playback.played.at(-1) ?? null;
  const shown = subtitleItem?.event;
  const historyItems = isPlayerSpeech(shown) ? playback.played.filter(item => item.event.seq !== shown.seq) : playback.played;
  const replay = summary.status === 'completed' || session > 0 || stream.ended;
  const replayFromStart = () => { closeSeat(); setSession((value) => value + 1); };
  const perspective = (
    <label className="audience-setting">
      <select aria-label="观战视角" value={seat === null ? 'god' : 'player'} onChange={(e) => {
        const seq = playback.current?.event.seq ?? playback.played.at(-1)?.event.seq;
        switchMode(e.target.value === 'player', seq === undefined ? start : Math.max(0, seq - 1));
      }}><option value="god">上帝视角</option><option value="player">{seat === null ? '随机玩家' : `玩家 · ${seat}号`}</option></select>
    </label>
  );
  if (narrow) {
    return <MobileStage summary={summary} playback={playback} stream={stream} options={options} onOptions={setOptions} finished={finished}
      replay={replay} perspective={perspective}
      result={hasResult && stream.result ? { value: stream.result, open: resultDialog.open, show: resultDialog.show, hide: resultDialog.hide, onReplay: replayFromStart } : null} />;
  }

  return (
    <div className="stage-shell" data-game={gameKey} data-layout={layout} data-period={period} data-finished={finished}>
      <StageBackdrop gameKey={gameKey} period={period} />
      {topicTitle && <DebateTitle title={topicTitle} />}
      <StageHud summary={summary} view={playback.view} connection={stream.connection} ended={finished} replay={replay} />
      <PlaybackControls hideFeedButton compact={!debate} options={options} pending={playback.pending} finished={finished} feedOpen={feedOpen} onChange={setOptions} onToggleFeed={toggleFeed}>
        {perspective}
      </PlaybackControls>
      {stream.error ? <StageError message={stream.error} onRetry={stream.connection === 'lost' ? stream.retry : null} /> : null}
      <AudioUnlockPrompt muted={options.muted} />
      <div className="stage-arena" ref={arenaRef}>
        <Stage layout={layout} view={playback.view} current={playback.current} played={playback.played} control={playback.control}
          playbackPaused={options.paused} playbackSpeed={options.speed} onSeatSelect={selectSeat} selectedSeat={selected?.seat ?? null} />
        {selected && selectedSeat && !(hasResult && resultDialog.open) ? (
          <SeatPopover key={selected.seat} seat={selectedSeat} speeches={selectedSpeeches} anchor={selected.anchor} arenaRef={arenaRef} onClose={closeSeat} />
        ) : null}
      </div>
      {!debate && <>
        {(!subtitleItem || !speechOf(subtitleItem.event)) && !isPlayerSpeech(subtitleItem?.event) &&
          <SubtitleBar quietIdle item={subtitleItem} view={playback.view} control={playback.control} />}
      </>}
      <SentenceCaptions item={subtitleItem} control={playback.control} announce={!debate} />
      <div className="stage-history stage-history-overview" hidden={!feedOpen}>
        <StageRecord items={playback.current ? [...playback.played,playback.current] : playback.played}
          filter="overview" onClose={closeFeed} />
      </div>
      <div className="stage-history stage-history-speech" hidden={!speechOpen}>
        <StageRecord title="发言记录" items={historyItems} filter="speech" onClose={closeSpeech} />
      </div>
      <div className="stage-actions">
        <Link className="button" to="/">← 返回大厅</Link>
        <button type="button" className="button" aria-pressed={feedOpen} title={SHORTCUT_HINTS.feed.title}
          aria-keyshortcuts={SHORTCUT_HINTS.feed.keys} onClick={toggleFeed}>对局记录</button>
        <button type="button" className="button" aria-pressed={speechOpen}
          onClick={toggleSpeech}>发言记录</button>
        {hasResult && !resultDialog.open ? <button type="button" className="button button-primary" title={SHORTCUT_HINTS.result.title} aria-keyshortcuts={SHORTCUT_HINTS.result.keys} onClick={resultDialog.show}>查看结果</button> : null}
      </div>
      {hasResult && resultDialog.open && stream.result ? (
        <ResultPanel result={stream.result} view={playback.view} summary={summary} onReplay={replayFromStart} onClose={resultDialog.hide} />
      ) : null}
    </div>
  );
}
