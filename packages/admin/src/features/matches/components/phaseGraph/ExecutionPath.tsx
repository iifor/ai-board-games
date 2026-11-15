import type { MatchDetailDto } from '@battle/shared';
import { Alert, Button, Empty, Select, Spin } from 'antd';
import { useMemo, useState } from 'react';
import { VisitDiagram } from './VisitDiagram';
import type { LogEntryDto } from '../../../../services/matches';
import { useMatchTrace } from '../../../traces/useMatchTrace';
import { announcedVisits, recordedVisits, type PhaseVisit } from './visits';

function VisitList({ visits, matchId }: { visits: readonly PhaseVisit[]; matchId: string }) {
  const [chosen, setChosen] = useState<number>();
  const rounds = useMemo(() => [...new Set(visits.map(v => v.round))], [visits]);
  const round = chosen !== undefined && rounds.includes(chosen) ? chosen : rounds.at(-1);
  if (round === undefined) return <Empty description="本局尚无可显示的阶段记录" />;
  const shown = visits.filter(v => v.round === round);
  return <div className="phase-history">
    <div className="phase-history-tools">
      <Select aria-label="选择轮次" value={round} onChange={setChosen} options={rounds.map(r => ({value:r,label:'第 '+r+' 轮'}))} />
      <span>{shown.length} {shown[0]?.nodeId !== undefined ? '次阶段访问' : '条阶段播报'}</span>
    </div>
    <VisitDiagram key={round} visits={shown} matchId={matchId} />
  </div>;
}

type Props = { detail: MatchDetailDto; log: readonly LogEntryDto[] };

export function ExecutionPath({ detail, log }: Props) {
  const trace = useMatchTrace(detail.traceDeleted ? null : detail.id);
  const nodes = trace.status === 'ready' ? trace.data?.nodes : null;
  const visits = useMemo(() => nodes ? recordedVisits(nodes) : [], [nodes]);
  if (detail.traceDeleted) return <LogPath detail={detail} log={log} />;
  if (trace.status === 'error') return <Alert type="error" title={trace.message} action={<Button onClick={trace.reload}>重试</Button>} />;
  if (!nodes) return <Spin aria-label="正在读取阶段访问记录" />;
  if (!visits.length) return <LogPath detail={detail} log={log} />;
  return <VisitList visits={visits} matchId={detail.id} />;
}

function LogPath({detail, log}: Props) {
  const visits = useMemo(() => announcedVisits(log), [log]);
  return <>
    <p className="phase-source">{detail.traceDeleted ? '本局调用链已删除' : '本局没有阶段追踪记录'}，仅显示日志中有播报的阶段。</p>
    <VisitList visits={visits} matchId={detail.id} />
  </>;
}

