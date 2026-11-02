import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { StatusView } from '../../../components/StatusView';
import { useAsync } from '../../../hooks/useAsync';
import { fetchCatalog } from '../../../services/games';
import { fetchMatch } from '../../../services/matches';
import { EventFeed } from '../components/EventFeed';
import { PhaseBanner } from '../components/PhaseBanner';
import { PlaybackControls } from '../components/PlaybackControls';
import { ResultPanel } from '../components/ResultPanel';
import { SpeakerSpotlight } from '../components/SpeakerSpotlight';
import { Stage } from '../components/Stage';
import { StageBackdrop } from '../components/StageBackdrop';
import { StageHud } from '../components/StageHud';
import { SubtitleBar } from '../components/SubtitleBar';
import { useMatchStream } from '../hooks/useMatchStream';
import { usePlayback } from '../hooks/usePlayback';
import type { PlaybackOptions } from '../types';
import { periodOf } from '../utils';
import './StagePage.css';

/** 对局舞台：实时观看与回放共用；全屏铺满，背景、座位、聚光立绘、字幕栏分层叠放 */
export function StagePage() {
  const matchId = useParams().matchId ?? '';
  const summary = useAsync(() => fetchMatch(matchId), [matchId]);
  const catalog = useAsync(fetchCatalog, []);
  const stream = useMatchStream(matchId);
  const [options, setOptions] = useState<PlaybackOptions>({ speed: 1, paused: false, muted: false });
  const [feedOpen, setFeedOpen] = useState(false);
  const playback = usePlayback(stream.items, stream.ack, options);

  if (summary.status === 'loading') return <StatusView kind="loading" />;
  if (summary.status === 'error') return <StatusView kind="error" message={summary.message} onRetry={summary.reload} />;
  const gameKey = summary.data.gameKey;
  const layout = catalog.status === 'ready' ? (catalog.data.find((game) => game.key === gameKey)?.layout ?? 'circle') : 'circle';
  const finished = stream.ended && playback.pending === 0 && !playback.current;
  const period = periodOf(playback.view);

  return (
    <div className="stage-shell" data-game={gameKey} data-period={period} data-finished={finished}>
      <StageBackdrop gameKey={gameKey} period={period} />
      <StageHud summary={summary.data} view={playback.view} connected={stream.connected} ended={stream.ended} />
      <PlaybackControls options={options} pending={playback.pending} finished={finished} feedOpen={feedOpen} onChange={setOptions} onToggleFeed={() => setFeedOpen((open) => !open)} />
      {stream.error ? <div className="stage-error glass-panel"><StatusView kind="error" message={stream.error} /></div> : null}
      <SpeakerSpotlight item={playback.current} view={playback.view} />
      <div className="stage-arena">
        <Stage layout={layout} view={playback.view} current={playback.current} />
      </div>
      <PhaseBanner item={playback.current} />
      <SubtitleBar item={playback.current} view={playback.view} />
      {finished && stream.result ? <ResultPanel result={stream.result} view={playback.view} /> : null}
      <aside className={`stage-feed glass-panel ${feedOpen ? 'is-open' : ''}`} aria-label="对局记录" aria-hidden={!feedOpen}>
        <header>
          <h2>对局记录</h2>
          <button type="button" className="button" onClick={() => setFeedOpen(false)}>收起</button>
        </header>
        <EventFeed items={playback.played} />
      </aside>
      <Link className="stage-exit button" to="/">← 返回大厅</Link>
    </div>
  );
}
