import type { ReplayPreview } from '@battle/shared';
import { useEffect, useMemo, useState } from 'react';
import { Stage } from '../components/Stage';
import { StageBackdrop } from '../components/StageBackdrop';
import { DebateTitle } from '../components/DebateTitle';
import { SentenceCaptions } from '../components/SentenceCaptions';
import { usePlayback } from '../hooks/usePlayback';
import { periodOf } from '../utils';
import { debateTopicOf } from '../layouts/debateTopic';
import type { PlaybackOptions } from '../types';
import { useNarrowStage } from '../hooks/useNarrowStage';
import { MobilePlayfield } from '../components/mobile/MobilePlayfield';
import './StagePage.css';
import '../components/mobile/MobileStage.css';
import '../components/mobile/MobileControls.css';

const ack = () => {};
function PreviewStage({data}:{data:ReplayPreview}) {
  const items = useMemo(()=>data.events.map(event=>({event,audio:null})),[data]);
  const segments = useMemo(()=>items.slice(data.start),[items,data.start]);
  const [options,set] = useState<PlaybackOptions>({muted:true,paused:false,speed:1});
  const play = usePlayback(segments,ack,options), view = play.view;
  const layout = items[0]?.event.view.gameKey === 'debate' ? 'versus' : 'circle';
  const period = periodOf(view), topic = debateTopicOf(view);
  const narrow = useNarrowStage();
  const played = [...items.slice(0,data.start),...play.played];
  const controls = <>
    <button type="button" className="button" onClick={()=>set({...options,paused:!options.paused})}>{options.paused?'继续':'暂停'}</button>
    <button type="button" className="button" onClick={()=>set({...options,speed:options.speed===1?3:1})}>{options.speed}×</button>
    {!play.pending && <b>回放结束</b>}
  </>;
  // 后台窗口较窄时（试播 iframe 宽 96vw）与手机舞台同一套座位区与发言卡
  if (narrow) return <div className="mobile-stage" data-game={view?.gameKey} data-period={period}>
    <StageBackdrop gameKey={items[0]!.event.view.gameKey} period={period} />
    {topic?.title && <p className="mobile-stage-topic">{topic.title}</p>}
    <MobilePlayfield layout={layout} view={view} current={play.current} played={played} control={play.control} />
    <nav className="mobile-controls" aria-label="播放控制">{controls}</nav>
  </div>;
  return <div className="stage-shell" data-game={view?.gameKey} data-layout={layout} data-period={period}>
    <StageBackdrop gameKey={items[0]!.event.view.gameKey} period={period} />
    {topic?.title && <DebateTitle title={topic.title}/>}
    <div className="stage-arena"><Stage layout={layout} view={view} current={play.current}
      played={played} control={play.control} playbackPaused={options.paused} playbackSpeed={options.speed}/></div>
    <SentenceCaptions item={play.current} control={play.control} announce={false}/>
    <div className="stage-actions">{controls}</div>
  </div>;
}
export function ImportPreview() {
  const [data,setData] = useState<ReplayPreview|null>(null);
  useEffect(()=>{
    const origin = new URL(import.meta.env.VITE_ADMIN_APP_URL || (import.meta.env.DEV ? location.protocol+'//'+location.hostname+':5174' : location.origin),location.origin).origin;
    const receive = (e: MessageEvent) => {
      if (e.source === window.parent && e.origin === origin && e.data?.type === 'replay-preview' && e.data.preview?.events?.length) setData(e.data.preview);
    };
    window.addEventListener('message',receive);
    if (window.parent !== window) window.parent.postMessage('replay-preview-ready',origin);
    return ()=>window.removeEventListener('message',receive);
  },[]);
  return data ? <PreviewStage data={data}/> : <p>等待后台试播…</p>;
}
