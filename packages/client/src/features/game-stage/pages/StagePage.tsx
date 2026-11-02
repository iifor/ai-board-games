import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { StatusView } from '../../../components/StatusView';
import { useAsync } from '../../../hooks/useAsync';
import { fetchMatch } from '../../../services/matches';
import { EventFeed, type FeedFilter } from '../components/EventFeed';
import { NightSteps } from '../components/NightSteps';
import { PhaseBanner } from '../components/PhaseBanner';
import { PlaybackControls } from '../components/PlaybackControls';
import { ResultPanel } from '../components/ResultPanel';
import { Stage } from '../components/Stage';
import { StageBackdrop } from '../components/StageBackdrop';
import { StageHud } from '../components/StageHud';
import { SubtitleBar } from '../components/SubtitleBar';
import { DRAWER_OPEN_MIN_WIDTH } from '../constants';
import { useMatchStream } from '../hooks/useMatchStream';
import { usePlayback } from '../hooks/usePlayback';
import { useResultDialog } from '../hooks/useResultDialog';
import type { PlaybackOptions } from '../types';
import { nightStepsOf, periodOf } from '../utils';
import './StagePage.css';

/** 对局舞台：实时观看与回放共用；全屏铺满，背景、座位与中央立绘、字幕栏、记录侧栏分层叠放 */
export function StagePage() {
  const matchId = useParams().matchId ?? '';
  const summary = useAsync(() => fetchMatch(matchId), [matchId]);
  const [session, setSession] = useState(0);
  const stream = useMatchStream(matchId, session);
  const [options, setOptions] = useState<PlaybackOptions>({ speed: 1, paused: false, muted: false });
  const [feedOpen, setFeedOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= DRAWER_OPEN_MIN_WIDTH);
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('all');
  const playback = usePlayback(stream.items, stream.ack, options);
  const finished = stream.ended && playback.pending === 0 && !playback.current;
  const resultDialog = useResultDialog(finished);

  if (summary.status === 'loading') return <StatusView kind="loading" />;
  if (summary.status === 'error') return <StatusView kind="error" message={summary.message} onRetry={summary.reload} />;
  const gameKey = summary.data.gameKey;
  // 布局随对局概要一起返回，不依赖游戏目录接口：目录拉不到时辩论赛也不会被画成圆桌
  const layout = summary.data.layout;
  const period = periodOf(playback.view);
  // 播完后字幕栏停在最后一段（终局摘要），而不是回到"等待下一段"
  const subtitleItem = playback.current ?? (finished ? (playback.played[playback.played.length - 1] ?? null) : null);
  const hasResult = finished && stream.result !== null;

  return (
    <div className="stage-shell" data-game={gameKey} data-period={period} data-finished={finished} data-feed-open={feedOpen}>
      <StageBackdrop gameKey={gameKey} period={period} />
      <StageHud summary={summary.data} view={playback.view} connected={stream.connected} ended={stream.ended} />
      <PlaybackControls options={options} pending={playback.pending} finished={finished} feedOpen={feedOpen} onChange={setOptions} onToggleFeed={() => setFeedOpen((open) => !open)} />
      <NightSteps steps={nightStepsOf(playback.played, playback.current, playback.view)} />
      {stream.error ? <div className="stage-error glass-panel"><StatusView kind="error" message={stream.error} /></div> : null}
      <div className="stage-arena">
        <Stage layout={layout} view={playback.view} current={playback.current} played={playback.played} />
      </div>
      <PhaseBanner item={playback.current} />
      <SubtitleBar item={subtitleItem} view={playback.view} control={playback.control} />
      {hasResult && resultDialog.open && stream.result ? (
        <ResultPanel result={stream.result} view={playback.view} summary={summary.data} onReplay={() => setSession((value) => value + 1)} onClose={resultDialog.hide} />
      ) : null}
      <aside className={`stage-feed glass-panel ${feedOpen ? 'is-open' : ''}`} aria-label="对局记录" aria-hidden={!feedOpen} inert={!feedOpen}>
        <header>
          <h2>对局记录</h2>
          <div className="stage-feed-filters" role="group" aria-label="筛选">
            <button type="button" className={feedFilter === 'all' ? 'is-active' : ''} onClick={() => setFeedFilter('all')}>全部</button>
            <button type="button" className={feedFilter === 'speech' ? 'is-active' : ''} onClick={() => setFeedFilter('speech')}>只看发言</button>
          </div>
          <button type="button" className="stage-feed-close" aria-label="收起记录" onClick={() => setFeedOpen(false)}>×</button>
        </header>
        <EventFeed items={playback.played} filter={feedFilter} />
      </aside>
      <div className="stage-actions">
        <Link className="button" to="/">← 返回大厅</Link>
        {hasResult && !resultDialog.open ? <button type="button" className="button button-primary" onClick={resultDialog.show}>查看结果</button> : null}
      </div>
    </div>
  );
}
