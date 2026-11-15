import { Alert, Segmented } from 'antd';
import { useSearchParams } from 'react-router';
import { LogPanel } from '../matches/components/LogPanel';
import { useMatchPage } from '../matches/pages/MatchPageLayout';
import { DeleteTraceButton } from './DeleteTraceButton';
import { MatchTraceView } from './MatchTraceView';
import { useMatchTrace } from './useMatchTrace';

export function MatchTracePage() {
  const { detail, log } = useMatchPage();
  const [params, setParams] = useSearchParams();
  const requestedView = params.get('view');
  const view = detail.traceDeleted || requestedView === 'log' ? 'log' : requestedView === 'timeline' ? 'timeline' : 'tree';
  const trace = useMatchTrace(view === 'log' ? null : detail.id);
  function changeView(nextView: 'tree' | 'timeline' | 'log') {
    const next = new URLSearchParams(params);
    next.set('tab', 'trace');
    next.set('view', nextView);
    if (nextView === 'log') {
      next.delete('node');
      next.delete('seq');
      next.delete('call');
    }
    setParams(next, { preventScrollReset: true });
  }
  return <section aria-labelledby="match-trace-title">
    <div className="match-trace-header">
      <h2 id="match-trace-title">整局调用链</h2>
      {!detail.traceDeleted && <DeleteTraceButton id={detail.id} />}
    </div>
    {detail.traceDeleted ? <Alert type="info" title="本局调用链已删除，以下为保留的完整日志。" />
      : <Segmented aria-label="查看方式" value={view} onChange={changeView} options={[
        { value: 'tree', label: '调用树' }, { value: 'timeline', label: '时间线' },
        { value: 'log', label: `完整日志（${log.length}）` },
      ]} />}
    {view === 'log' ? <div style={{ marginTop: 12 }}><LogPanel key={params.get('seq') ?? ''} focusSeq={Number(params.get('seq'))}
      log={log} matchId={detail.traceDeleted ? null : detail.id} /></div>
      : <MatchTraceView matchId={detail.id} result={trace} view={view} />}
  </section>;
}
