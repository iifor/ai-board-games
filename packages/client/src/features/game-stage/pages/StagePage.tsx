import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { StatusView } from '../../../components/StatusView';
import { useAsync } from '../../../hooks/useAsync';
import { fetchCatalog } from '../../../services/games';
import { fetchMatch } from '../../../services/matches';
import { EventFeed } from '../components/EventFeed';
import { PlaybackControls } from '../components/PlaybackControls';
import { ResultPanel } from '../components/ResultPanel';
import { Stage } from '../components/Stage';
import { StageHeader } from '../components/StageHeader';
import { useMatchStream } from '../hooks/useMatchStream';
import { usePlayback } from '../hooks/usePlayback';
import type { PlaybackOptions } from '../types';
import './StagePage.css';

/** 对局舞台：实时观看与回放共用 */
export function StagePage() {
  const matchId = useParams().matchId ?? '';
  const summary = useAsync(() => fetchMatch(matchId), [matchId]);
  const catalog = useAsync(fetchCatalog, []);
  const stream = useMatchStream(matchId);
  const [options, setOptions] = useState<PlaybackOptions>({ speed: 1, paused: false, muted: false });
  const playback = usePlayback(stream.items, stream.ack, options);

  if (summary.status === 'loading') return <StatusView kind="loading" />;
  if (summary.status === 'error') return <StatusView kind="error" message={summary.message} onRetry={summary.reload} />;
  const layout = catalog.status === 'ready' ? catalog.data.find((game) => game.key === summary.data.gameKey)?.layout ?? 'circle' : 'circle';
  const finished = stream.ended && playback.pending === 0 && !playback.current;

  return (
    <div className="stage-page">
      <StageHeader summary={summary.data} view={playback.view} connected={stream.connected} ended={stream.ended} />
      {stream.error ? <StatusView kind="error" message={stream.error} /> : null}
      <PlaybackControls options={options} pending={playback.pending} finished={finished} onChange={setOptions} />
      <Stage layout={layout} view={playback.view} current={playback.current} />
      {finished && stream.result ? <ResultPanel result={stream.result} view={playback.view} /> : null}
      <section className="stage-feed card" aria-label="对局记录">
        <h2>对局记录</h2>
        <EventFeed items={playback.played} />
      </section>
      <Link to="/">返回大厅</Link>
    </div>
  );
}
