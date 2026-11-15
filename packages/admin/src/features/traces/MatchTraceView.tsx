import type { TraceKind, TraceNodeDto } from '@battle/shared';
import { Alert, Button, Checkbox, Empty, Input, Select, Space, Spin, Splitter, Table } from 'antd';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { formatTime } from '../../utils/format';
import { KIND_LABELS, traceLabel } from './labels';
import { TraceNodePanel } from './TraceNodePanel';
import { useRemainingHeight } from '../../hooks/useRemainingHeight';
import { TraceTree } from './TraceTree';
import { issueNodeIds } from './traceTreeData';
import { filterNodes } from './filterNodes';
import type { MatchTraceState } from './useMatchTrace';
import './traces.css';

export function MatchTraceView({ matchId, result, view }: {
  readonly matchId: string; readonly result: MatchTraceState; readonly view: 'tree' | 'timeline';
}) {
  const [params, setParams] = useSearchParams();
  const [kind, setKind] = useState<TraceKind>();
  const [seat, setSeat] = useState<number>();
  const [search, setSearch] = useState('');
  const [issuesOnly, setIssuesOnly] = useState(false);
  const data = result.status === 'ready' ? result.data : null;
  const filtered = Boolean(search.trim() || kind || seat !== undefined || issuesOnly);
  const shown = useMemo(() => {
    if (!data) return [];
    const rows = filterNodes(data.nodes, search, kind, seat);
    if (!issuesOnly) return rows;
    const issues = issueNodeIds(data.nodes, data.calls);
    return rows.filter(n => issues.has(n.id));
  }, [data, search, kind, seat, issuesOnly]);
  const matches = useMemo(() => filtered ? new Set(shown.map(n => n.id)) : null, [filtered, shown]);
  if (!data) return result.status === 'error'
    ? <Alert type="error" title={result.message} action={<Button onClick={result.reload}>重试</Button>} /> : <Spin />;

  const { match, nodes, models } = data;
  const selected = params.has('node') ? nodes.find((n) => String(n.id) === params.get('node'))
    : params.has('seq') ? nodes.find((n) => n.seq !== null && String(n.seq) === params.get('seq'))
    : nodes.find(n => n.kind === 'decision' && n.requestIds.includes(params.get('request') ?? ''))
      ?? nodes.find(n => n.kind === 'request' && n.requestIds.includes(params.get('request') ?? ''));
  const callId = Number(params.get('call')) || undefined;
  const open = (id: number, call?: number) => setParams({ tab: 'trace', view, node: String(id), ...(call && { call: String(call) }) }, {preventScrollReset:true});
  return <section className="trace-page">
    {models.map((model) => <p key={model.modelName}>{model.modelName} · {model.calls} 次调用 · {model.failures} 次失败 ·
      输入 {model.promptTokens} / 输出 {model.completionTokens} Token（{model.measured} 次有用量）</p>)}
    <Space wrap style={{ marginBlock: 12 }}>
      <Select allowClear aria-label="节点类型" placeholder="全部节点" style={{ width: 150 }} value={kind} onChange={setKind}
        options={Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label }))} />
      <Select allowClear aria-label="玩家" placeholder="全部玩家" style={{ width: 185 }} value={seat} onChange={setSeat}
        options={match.seats.map((p) => ({ value: p.seat, label: p.seat + ' 号 · ' + p.name }))} />
      <Input allowClear aria-label="搜索调用链" value={search} placeholder="阶段、请求或 #事件号" onChange={(e) => setSearch(e.target.value)} />
      <Checkbox checked={issuesOnly} onChange={e => setIssuesOnly(e.target.checked)}>只看异常</Checkbox>
      <Button onClick={result.reload}>刷新</Button>
      {filtered && <><span role="status">{shown.length} 个匹配节点</span><Button onClick={() => { setSearch(''); setKind(undefined); setSeat(undefined); setIssuesOnly(false); }}>清除筛选</Button></>}
    </Space>
    {(params.has('node') || params.has('seq') || params.has('request')) && !selected && <Alert type="info" title="本局没有这个节点的采集记录" />}
    <TraceSplit detail={selected
      ? <TraceNodePanel key={selected.id + '/' + (callId ?? '')} matchId={matchId} match={match} scripted={match.scripted} node={selected}
        nodes={nodes} callId={callId} revision={nodes.length} onOpen={open} />
      : <div className="trace-pick-node">选择左侧节点查看事件摘要</div>}>
      {nodes.length && !shown.length ? <Empty description="没有符合筛选条件的记录" />
        : nodes.length && view === 'tree' ? <TraceTree nodes={nodes} calls={data.calls} matches={matches} selectedId={selected?.id} selectedCallId={callId} onOpen={open} />
        : nodes.length ? <Table<TraceNodeDto> size="small" rowKey="id" dataSource={shown} pagination={{ pageSize: 35, showSizeChanger: false }}
        columns={[
          { title: '记录时间', responsive: ['md'], render: (_, n) => formatTime(n.createdAt) },
          { title: '轮次 / 阶段', render: (_, n) => n.phaseId ? `R${n.round} · ${n.phaseId}（${n.visit}）` : '全局' },
          { title: '节点', responsive: ['md'], render: (_, n) => KIND_LABELS[n.kind] },
          { title: '详情', render: (_, n) => <Link preventScrollReset to={'?tab=trace&view=timeline&node=' + n.id}>{traceLabel(n.label)} {n.seq !== null && '#' + n.seq}</Link> },
          { title: '玩家 / 行动', render: (_, n) => n.seat !== null ? n.seat + ' 号' : n.requestIds.length > 0 ? n.requestIds.length + ' 个关联请求' : '—' },
        ]} /> : <Empty description="本局尚无调用链节点。采集从功能启用后的新推进开始。" />}
    </TraceSplit>
  </section>;
}

function TraceSplit({children, detail}: {children: React.ReactNode; detail: React.ReactNode}) {
  const {ref, height} = useRemainingHeight(320, 32, '.match-workspace-tabs');
  return <div className="trace-workspace" ref={ref} style={{height}}>
    <Splitter>
      <Splitter.Panel defaultSize="55%" min="34%" max="72%">{children}</Splitter.Panel>
      <Splitter.Panel>{detail}</Splitter.Panel>
    </Splitter>
  </div>;
}
