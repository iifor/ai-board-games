import { Alert, Spin, Tag } from 'antd';
import { useAsync } from '../../../hooks/useAsync';
import { fetchPhaseGraph } from '../../../services/matches';
import './PhaseGraph.css';

/** 阶段图：列出全部阶段与跳转目标，高亮当前阶段 */
export function PhaseGraph({ gameKey, current }: { readonly gameKey: string; readonly current: string | null }) {
  const graph = useAsync(() => fetchPhaseGraph(gameKey), [gameKey]);
  if (graph.status === 'loading') return <Spin />;
  if (graph.status === 'error') return <Alert type="error" title={graph.message} />;
  return (
    <ol className="phase-graph">
      {graph.data.phases.map((phase) => (
        <li key={phase.id} className={phase.id === current ? 'phase-graph-current' : ''}>
          <code>{phase.id}</code>
          <Tag>{phase.kind}</Tag>
          {phase.title ? <span>{phase.title}</span> : null}
          {phase.id === graph.data.start ? <Tag color="blue">起点</Tag> : null}
          <span className="phase-graph-next">→ {phase.next.join(' / ')}</span>
        </li>
      ))}
    </ol>
  );
}
