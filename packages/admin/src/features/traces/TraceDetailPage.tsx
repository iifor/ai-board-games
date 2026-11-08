import type { TraceKind, TraceNodeDto } from '@battle/shared';
import { Alert, Button, Empty, Input, Segmented, Select, Space, Spin, Table, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useAsync } from '../../hooks/useAsync';
import { fetchTrace } from '../../services/traces';
import { formatTime } from '../../utils/format';
import { isTerminal, STATUS_LABELS } from '../matches/utils';
import { KIND_LABELS, traceLabel } from './labels';
import { TraceNodeDrawer } from './TraceNodeDrawer';
import { TraceTree } from './TraceTree';
import { filterNodes } from './filterNodes';
import { useTraceTitle } from './useTraceTitle';
import { DeleteTraceButton } from './DeleteTraceButton';
import { onAdminViewResumed, onTraceRemoved } from '../../services/traceInvalidation';

export function TraceDetailPage() {
  const matchId = useParams().matchId ?? '';
  const title = useTraceTitle();
  const [params, setParams] = useSearchParams();
  const [kind, setKind] = useState<TraceKind>();
  const [seat, setSeat] = useState<number>();
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'tree' | 'timeline'>('tree');
  const result = useAsync(() => fetchTrace(matchId), [matchId]);
  useEffect(() => onAdminViewResumed(result.invalidate), [result.invalidate]);
  const navigate = useNavigate();
  useEffect(() => onTraceRemoved((id) => {
    if (id === matchId) navigate('/traces', { replace: true });
  }), [matchId, navigate]);
  const data = result.status === 'ready' ? result.data : null;
  const running = data !== null && !isTerminal(data.match.status);
  const { reload } = result;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(reload, 4000);
    return () => clearInterval(id);
  }, [running, reload]);
  if (!data) return result.status === 'error'
    ? <Alert type="error" title={result.message} action={<Button onClick={reload}>重试</Button>} /> : <Spin />;

  const { match, nodes, models } = data;
  const shown = filterNodes(nodes, search, kind, seat);
  const filtered = Boolean(search.trim() || kind || seat !== undefined);
  const selected = params.has('node') ? nodes.find((n) => String(n.id) === params.get('node'))
    : params.has('seq') ? nodes.find((n) => n.seq !== null && String(n.seq) === params.get('seq')) : undefined;
  const open = (id: number) => setParams({ node: String(id) });
  return <section className="trace-page">
    <Space wrap><Link to="/traces">全部调用链</Link><Link to={'/matches/' + match.id}>对局与调试</Link></Space>
    <div className="trace-heading"><Typography.Title level={3}>{title(match)} · 整局调用链</Typography.Title><DeleteTraceButton id={match.id} /></div>
    <p><code>{match.id}</code> · {STATUS_LABELS[match.status].label} · {match.scripted ? '脚本驱动' : '模型驱动'}</p>
    {match.error && <Alert title={match.error} type="error" />}
    {models.map((model) => <p key={model.modelName}>{model.modelName} · {model.calls} 次调用 · {model.failures} 次失败 ·
      输入 {model.promptTokens} / 输出 {model.completionTokens} Token（{model.measured} 次有用量）</p>)}
    <Space wrap style={{ marginBlock: 12 }}>
      {!filtered && <Segmented aria-label="查看方式" value={view} onChange={setView} options={[{ value: 'tree', label: '调用树' }, { value: 'timeline', label: '时间线' }]} />}
      <Select allowClear aria-label="节点类型" placeholder="全部节点" style={{ width: 150 }} value={kind} onChange={setKind}
        options={Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label }))} />
      <Select allowClear aria-label="玩家" placeholder="全部玩家" style={{ width: 185 }} value={seat} onChange={setSeat}
        options={match.seats.map((p) => ({ value: p.seat, label: p.seat + ' 号 · ' + p.name }))} />
      <Input allowClear aria-label="搜索调用链" value={search} placeholder="阶段、请求或 #事件号" onChange={(e) => setSearch(e.target.value)} />
      <Button onClick={reload}>刷新</Button>
      {filtered && <><span role="status">{shown.length} 个匹配节点</span><Button onClick={() => { setSearch(''); setKind(undefined); setSeat(undefined); }}>清除筛选</Button></>}
    </Space>
    {(params.has('node') || params.has('seq')) && !selected && <Alert type="info" title="本局没有这个节点的采集记录" />}
    {nodes.length && !shown.length ? <Empty description="没有符合筛选条件的记录" />
      : nodes.length && view === 'tree' && !filtered ? <TraceTree nodes={shown} calls={data.calls} onOpen={open} />
      : nodes.length ? <Table<TraceNodeDto> size="small" rowKey="id" dataSource={shown} pagination={{ pageSize: 35, showSizeChanger: false }}
      columns={[
        { title: '记录时间', responsive: ['md'], render: (_, n) => formatTime(n.createdAt) },
        { title: '轮次 / 阶段', render: (_, n) => n.phaseId ? `R${n.round} · ${n.phaseId}（${n.visit}）` : '全局' },
        { title: '节点', responsive: ['md'], render: (_, n) => KIND_LABELS[n.kind] },
        { title: '详情', render: (_, n) => <Link to={'?node=' + n.id}>{traceLabel(n.label)} {n.seq !== null && '#' + n.seq}</Link> },
        { title: '玩家 / 行动', render: (_, n) => n.seat !== null ? n.seat + ' 号' : n.requestIds.length > 0 ? n.requestIds.length + ' 个关联请求' : '—' },
      ]} /> : <Empty description="本局尚无调用链节点。采集从功能启用后的新推进开始。" />}
    {selected && <TraceNodeDrawer key={selected.id} matchId={matchId} scripted={match.scripted} node={selected} nodes={nodes}
      revision={nodes.length} onOpen={open} onClose={() => setParams({})} />}
  </section>;
}
