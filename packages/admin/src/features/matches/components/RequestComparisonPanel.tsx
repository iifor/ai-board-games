import { Alert, Button, Empty, Select, Spin } from 'antd';
import { useMemo, useState } from 'react';
import { useAsync } from '../../../hooks/useAsync';
import { fetchTraceNode } from '../../../services/traces';
import { PromptComparisonForm } from '../../traces/PromptComparisonForm';
import { useMatchTrace } from '../../traces/useMatchTrace';
import { requestOptions, type RequestOption } from './requestOptions';

function SelectedRequest({ matchId, option, onBusy }: {
  matchId: string; option: RequestOption; onBusy: (busy: boolean) => void;
}) {
  const result = useAsync(async () => {
    const node = await fetchTraceNode(matchId, option.nodeId);
    // 一个节点也可能关联触发推进的上一条请求。
    const request = node.requests.find(item => item.id === option.value);
    if (!request) throw new Error('这条请求的明细暂不可用');
    return request;
  }, [matchId, option.nodeId, option.value]);
  if (result.status === 'loading') return <Spin aria-label="正在加载请求" />;
  if (result.status === 'error') return <Alert type="error" title={result.message} action={<Button onClick={result.reload}>重试</Button>} />;
  return <PromptComparisonForm matchId={matchId} request={result.data} onBusy={onBusy} />;
}

export function RequestComparisonPanel({ matchId }: { matchId: string }) {
  const trace = useMatchTrace(matchId);
  const data = trace.status === 'ready' ? trace.data : null;
  const options = useMemo(() => data ? requestOptions(data) : [], [data]);
  const [selected, setSelected] = useState<RequestOption>();
  const [busy, setBusy] = useState(false);
  return <div className="request-comparison">
    {trace.status === 'error' && <Alert type="error" title={trace.message} action={<Button onClick={trace.reload}>重试</Button>} />}
    {trace.status === 'ready' && !options.length && !selected ? <Empty description="本局尚无可对比的 AI 请求" /> : <>
      <label htmlFor="debug-request">选择本局请求</label>
      <Select<string, RequestOption> id="debug-request" placeholder="搜索玩家、阶段、动作或请求 ID"
        loading={trace.status === 'loading'} disabled={busy || !options.length} options={options}
        value={selected?.value ?? null} onChange={(_, option) => { if (option && !Array.isArray(option)) setSelected(option); }}
        showSearch={{ optionFilterProp: 'search' }} notFoundContent="没有匹配的请求"
        optionRender={({ data: item }) => <div>{item.label}<br /><small>{item.value}</small></div>} />
    </>}
    {selected && <SelectedRequest key={selected.value} matchId={matchId} option={selected} onBusy={setBusy} />}
  </div>;
}
