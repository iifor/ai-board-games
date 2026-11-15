import type { PerspectiveRecord } from '@battle/shared';
import { Alert, Button, Select, Space, Spin } from 'antd';
import { useEffect, useState } from 'react';
import { useAsync } from '../../hooks/useAsync';
import { perspectives } from '../../services/perspectives';
import { onTraceRemoved } from '../../services/traceInvalidation';
import { PerspectiveTimeline } from './PerspectiveTimeline';

import './perspectives.css';

export function MatchPerspective({ matchId }: { matchId: string }) {
  const record = useAsync(() => perspectives.record(matchId), [matchId]);
  useEffect(() => onTraceRemoved(removed => { if (removed === matchId) record.invalidate(); }), [matchId, record.invalidate]);
  return <section className="perspective-panel">{record.status === 'loading' ? <Spin /> : record.status === 'error'
    ? <Alert type="error" title={record.message} action={<Button onClick={record.reload}>重试</Button>} />
    : <NightView id={matchId} record={record.data} reload={record.reload} />}</section>;
}

function NightView({ id, record, reload }: { id: string; record: PerspectiveRecord; reload: () => void }) {
  const [chosenRound, chooseRound] = useState(1);
  const [scope, chooseScope] = useState('');
  const [viewer, chooseViewer] = useState(0);
  const rounds = [...new Set([...record.events, ...record.requests].map(row => row.round))].sort((a,b) => a-b);
  const round = rounds.includes(chosenRound) ? chosenRound : rounds[0];
  const events = record.events.filter(e => e.round === round);
  const requests = record.requests.filter(r => r.round === round);
  const phases = new Map(events.map(e => [e.phase, e.phaseTitle]));
  for (const r of requests) if (!phases.has(r.phase)) phases.set(r.phase, r.phase);
  const all = !scope || !phases.has(scope);
  const selected = events.filter(e => all || scope === e.phase);
  const names = selected[0]?.roles ?? events[0]?.roles ?? {};
  return <>
    <Space wrap className="perspective-controls">
      <Select<number> aria-label="轮次" value={round ?? null} options={rounds.map(value => ({value, label:'第 ' + value + ' 轮'}))}
        onChange={value => {chooseRound(value); chooseScope('');}} />
      <Select aria-label="行动阶段" virtual={false} showSearch optionFilterProp="label" value={all ? '' : scope} onChange={chooseScope}
        options={[{value:'',label:'整轮'}, ...[...phases].filter(([key]) => key).map(([value,label]) => ({value,label}))]} />
      <Select aria-label="对照座位" virtual={false} value={viewer} onChange={chooseViewer} options={[{value:0,label:'全部座位对照'}, {value:-1,label:'上帝视角'}, ...record.seats.map(s =>
        ({value:s.seat, label:`${s.seat}号 · ${names[s.seat] ?? s.name}`}))]} />
      <Button onClick={reload}>刷新记录</Button>
    </Space>
    <PerspectiveTimeline matchId={id} events={selected} requests={requests.filter(r => all || r.phase === scope)}
      allSeats={record.seats.map(s => s.seat)} viewer={viewer} available={record.requestsAvailable} />
  </>;
}

