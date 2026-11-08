import type { TraceNodeDto, TraceRequestDto } from '@battle/shared';
import { Alert, Button, Drawer, Space, Spin, Tag } from 'antd';
import { useAsync } from '../../hooks/useAsync';
import { fetchTraceNode } from '../../services/traces';
import { describeLog } from '../matches/utils';
import { KIND_LABELS, traceLabel } from './labels';
import './traces.css';

function Json({ title, value }: { title: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return <details><summary>{title}</summary><pre>{JSON.stringify(value, null, 2)}</pre></details>;
}

function Request({ request, scripted }: { request: TraceRequestDto; scripted: boolean }) {
  return <section className="trace-request">
    <strong>{request.seat} 号 · {traceLabel(request.action)}</strong> <Tag>{scripted ? '脚本' : '模型'}</Tag>
    <div><code>{request.id}</code> · 第 {request.attempt} 次请求 · {request.status}</div>
    {request.error && <Alert type="error" title={request.error} />}
    <Json title="分层提示词" value={request.prompt} />
    <Json title="消息与输出约束" value={{ messages: request.messages, schema: request.outputSchema, legalTargets: request.legalTargets }} />
    <Json title={scripted ? '脚本原始输出' : '任务输出'} value={request.output} />
    {request.calls.map((call) => <details key={call.id}>
      <summary>{call.modelName} · {call.error ? '失败' : '成功'} · {call.latencyMs} ms</summary>
      <Json title="请求参数与用量" value={{ settings: call.settings, usage: call.usage }} />
      {call.error && <p>{call.error}</p>}
      {call.rawResponse !== null && <pre>{call.rawResponse}</pre>}
      <Json title="解析结果" value={call.output} />
    </details>)}
  </section>;
}

interface Props {
  matchId: string;
  scripted: boolean;
  node: TraceNodeDto;
  nodes: readonly TraceNodeDto[];
  onOpen: (id: number) => void;
  onClose: () => void;
  revision: number;
}

export function TraceNodeDrawer({ matchId, scripted, node, nodes, onOpen, onClose, revision }: Props) {
  const result = useAsync(() => fetchTraceNode(matchId, node.id), [matchId, node.id, revision]);
  const samePhase = nodes.filter((n) => n.phaseId === node.phaseId && n.visit === node.visit && n.round === node.round);
  const links = new Set(node.requestIds);
  const related = samePhase.filter((n) => n.id !== node.id && (
    n.kind === 'phase' || n.kind === 'settlement' || ((node.kind === 'phase' || node.kind === 'settlement') && n.kind === 'decision')
    || n.requestIds.some((id) => links.has(id))
  ));
  return <Drawer open size="large" onClose={onClose} title={KIND_LABELS[node.kind] + ' · ' + traceLabel(node.label)}>
    <div className="trace-inspector">
      <p>第 {node.round} 轮 · {node.phaseId ?? '全局'} · 第 {node.visit} 次进入 {node.seq !== null && ' · 事件 #' + node.seq}</p>
      {result.status === 'loading' && <Spin />}
      {result.status === 'error' && <Alert type="error" title={result.message} action={<Button onClick={result.reload}>重试</Button>} />}
      {result.status === 'ready' && <>
        {result.data.event && <><p>{describeLog(result.data.event)}</p><Json title="当时的舞台与观众视图" value={result.data.event} /></>}
        <Json title={node.kind === 'settlement' ? '规则结果与结算时快照' : '节点数据'} value={result.data.data} />
        {result.data.requests.map((request) => <div key={request.id}>
          <small>{links.has(request.id) ? '直接关联的行动' : '触发本次推进的输入'}</small>
          <Request request={request} scripted={scripted} />
        </div>)}
      </>}
      {related.length > 0 && <details open><summary>同阶段关联节点</summary>
        <Space wrap>{related.map((n) => <Button size="small" key={n.id} onClick={() => onOpen(n.id)}>
          {KIND_LABELS[n.kind]} {KIND_LABELS[n.kind] !== traceLabel(n.label) && '· ' + traceLabel(n.label)} {n.seq !== null && '#' + n.seq}
        </Button>)}</Space>
      </details>}
    </div>
  </Drawer>;
}
