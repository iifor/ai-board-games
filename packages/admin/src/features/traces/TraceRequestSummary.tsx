import { Button, Tag } from 'antd';
import type { TraceRequestDto } from '@battle/shared';
import { useState } from 'react';
import { PromptComparisonDialog } from './PromptComparisonDialog';
import { traceLabel } from './labels';
import { DecisionMemory } from '../player-memory/DecisionMemory';

interface Props {
  request: TraceRequestDto;
  matchId: string;
  scripted: boolean;
  direct: boolean;
  callId?: number | undefined;
}

export function TraceRequestSummary({ request, matchId, scripted, direct, callId }: Props) {
  const [debug, setDebug] = useState<'request' | number | null>(null);
  return <section className="trace-request">
    <small>{direct ? '直接关联的行动' : '触发本次推进的输入'}</small>
    <div className="trace-request-heading">
      <strong>{request.seat} 号 · {traceLabel(request.action)}</strong>
      <Tag>{scripted ? '脚本' : '模型'}</Tag>
      <Button size="small" onClick={() => setDebug('request')}>调试这条请求</Button>
    </div>
    <p>第 {request.attempt} 次请求 · {request.status}</p>
    {request.error && <p className="trace-error-text">{request.error}</p>}
    {request.memory && <DecisionMemory memory={request.memory} />}
    {request.calls.map(call => <div key={call.id} className="trace-call-summary" data-selected={call.id === callId}>
      <strong>{call.modelName}</strong> · {call.error !== null ? '失败' : '成功'} · {call.latencyMs} ms
      {call.settings && <Button size="small" onClick={() => setDebug(call.id)}>调试这次调用</Button>}
      {call.error && <p className="trace-error-text">{call.error}</p>}
    </div>)}
    {debug !== null && <PromptComparisonDialog matchId={matchId} request={request}
      initialCallId={typeof debug === 'number' ? debug : undefined} onClose={() => setDebug(null)} />}
  </section>;
}
