import type { MatchTraceDto, TraceNodeDto } from '@battle/shared';
import { Alert, Button, Space, Spin, Tabs } from 'antd';
import { lazy, Suspense } from 'react';
import { useAsync } from '../../hooks/useAsync';
import { fetchTraceNode } from '../../services/traces';
import { KIND_LABELS, phaseLabel, traceLabel } from './labels';
import { TraceEventSummary, TraceSnapshot } from './TraceEventSummary';
import { TraceRequestSummary } from './TraceRequestSummary';

const TraceJsonViewer = lazy(() => import('./TraceJsonViewer'));

interface Props {
  match: MatchTraceDto['match'];
  matchId: string;
  scripted: boolean;
  node: TraceNodeDto;
  nodes: readonly TraceNodeDto[];
  onOpen: (id: number) => void;
  revision: number;
  callId?: number | undefined;
}

export function TraceNodePanel({ matchId, match, scripted, node, nodes, onOpen, revision, callId }: Props) {
  const result = useAsync(() => fetchTraceNode(matchId, node.id), [matchId, node.id, revision]);
  const detail = result.status === 'ready' ? result.data : null;
  const samePhase = nodes.filter(n => n.phaseId === node.phaseId && n.visit === node.visit && n.round === node.round);
  const phase = samePhase.find(n => n.kind === 'phase');
  const phaseName = phase && phase.label !== node.phaseId ? phase.label : phaseLabel(node.phaseId);
  const links = new Set(node.requestIds);
  const related = samePhase.filter(n => n.id !== node.id && (
    n.kind === 'phase' || n.kind === 'settlement' || ((node.kind === 'phase' || node.kind === 'settlement') && n.kind === 'decision')
    || n.requestIds.some(id => links.has(id))
  ));
  const call = callId === undefined ? null : detail?.requests.flatMap(r => r.calls).find(c => c.id === callId);
  let title = traceLabel(node.label);
  if (detail?.event?.kind === 'phase_started') title = '进入' + detail.event.title;
  else if (node.kind === 'phase') title = '进入' + phaseName;
  if (call) title = call.modelName + ' · ' + (call.error !== null ? '调用失败' : '调用成功');

  return <aside className="trace-node-panel" aria-label="节点详情">
    <header>
      <small>{call ? '模型调用' : KIND_LABELS[node.kind]}{node.seq !== null && ' · 事件 #' + node.seq}</small>
      <h3>{title}</h3>
      <p>第 {node.round} 轮 › {phaseName} · {node.visit === 0 ? '进入前' : '第 ' + node.visit + ' 次进入'}</p>
    </header>
    {result.status === 'loading' && <Spin aria-label="正在读取节点详情" />}
    {result.status === 'error' && <Alert type="error" title={result.message} action={<Button onClick={result.reload}>重试</Button>} />}
    {detail && <Tabs defaultActiveKey={node.kind === 'settlement' || node.label === '开局' ? 'raw' : 'summary'}
      classNames={{ body: 'trace-tab-body', content: 'trace-tab-content' }} items={[
      { key:'summary', label:'事件摘要', children:<div className="trace-summary">
        <TraceEventSummary node={node} detail={detail} />
        {related.length > 0 && <section><h4>同阶段记录</h4><Space wrap>{related.map(n =>
          <Button size="small" key={n.id} onClick={() => onOpen(n.id)}>
            {KIND_LABELS[n.kind]}{KIND_LABELS[n.kind] !== traceLabel(n.label) && ' · ' + traceLabel(n.label)}{n.seq !== null && ' #' + n.seq}
          </Button>)}</Space></section>}
        {detail.event && <TraceSnapshot event={detail.event} />}
        {detail.requests.map(request => <TraceRequestSummary key={request.id} matchId={matchId} request={request}
          scripted={scripted} direct={links.has(request.id)} callId={callId} />)}
      </div> },
      { key:'raw', label:'节点数据', children:<Suspense fallback={<Spin aria-label="正在加载节点数据" />}>
        <TraceJsonViewer detail={detail} match={match} />
      </Suspense> },
    ]} />}
  </aside>;
}
