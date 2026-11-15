import type { MatchDetailDto } from '@battle/shared';
import { Card, Empty, Tabs } from 'antd';
import { useLocation, useSearchParams } from 'react-router';
import { MatchTracePage } from '../../traces/MatchTracePage';
import { MatchPerspective } from '../../perspectives/MatchPerspective';
import type { MatchDetailState } from '../hooks/useMatchDetail';
import { DebugControls } from './DebugControls';
import { ExecutionPath } from './phaseGraph/ExecutionPath';
import { TracePanel } from './TracePanel';
import { RequestComparisonPanel } from './RequestComparisonPanel';

type Props = Pick<MatchDetailState, 'log' | 'calls'> & { detail: MatchDetailDto; onChanged: () => void };

export function MatchTools({ detail, log, calls, onChanged }: Props) {
  const [params, setParams] = useSearchParams();
  const { hash } = useLocation();
  const tab = params.get('tab');
  const hasPerspective = detail.gameKey === 'werewolf';
  const hasTraceTarget = params.has('node') || params.has('seq') || hash === '#trace';
  const active = hasTraceTarget || tab === 'trace' ? 'trace'
    : tab === 'controls' || tab === 'calls' || (hasPerspective && tab === 'perspective') ? tab : 'compare';
  return <Tabs className="match-workspace-tabs" aria-label="对局工作区" activeKey={active}
    onChange={key => setParams({ tab: key }, { preventScrollReset: true })} items={[
    { key: 'compare', label: '请求对比', children: detail.traceDeleted
      ? <Empty description="本局调用链已删除，无法对比历史请求。" />
      : <RequestComparisonPanel key={detail.id} matchId={detail.id} /> },
    { key: 'controls', label: '调试', destroyOnHidden: true, children: <div className="match-detail-debug">
      <Card size="small" title="调试指令"><DebugControls detail={detail} onChanged={onChanged} /></Card>
      <Card size="small" title="本局路径图"><ExecutionPath detail={detail} log={log} /></Card>
    </div> },
    { key: 'calls', label: `模型调用（${calls.length}）`, children: <TracePanel calls={calls} /> },
    ...(hasPerspective ? [{ key: 'perspective', label: '对局视角', children: <MatchPerspective matchId={detail.id} /> }] : []),
    { key: 'trace', label: '查看调用链', destroyOnHidden: true, children: <MatchTracePage /> },
  ]} />;
}
