import type { ComparisonModel, PromptComparisonContext, PromptComparisonRecord, TraceRequestDto } from '@battle/shared';
import { Alert, Button, Input, Select, Space, Spin } from 'antd';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { useAsync } from '../../hooks/useAsync';
import { errorMessage } from '../../services/http';
import { modelsApi } from '../../services/resources';
import { comparePrompts, comparisonContext } from '../../services/traces';
import { PromptComparisonResult } from './PromptComparisonResult';
import { ApplyComparisonButton } from './ApplyComparisonButton';
import './promptComparison.css';

interface Props {
  readonly initialCallId?: number | undefined;
  readonly matchId: string;
  readonly request: TraceRequestDto;
  readonly onBusy: (busy: boolean) => void;
}

function Editor({ matchId, request, context, initialCallId, onBusy }: Props & { context: PromptComparisonContext }) {
  const models = useAsync(modelsApi.list, []);
  const calls = request.calls.filter(call => call.settings);
  const preferred = calls.find(call => call.id === initialCallId) ?? calls.findLast(call => !call.error) ?? calls.at(-1);
  const [choice, setChoice] = useState<string | undefined>(preferred ? 'call/' + preferred.id : undefined);
  const [persona, setPersona] = useState(context.persona);
  const initialInstruction = context.template?.source ?? context.instruction;
  const [instruction, setInstruction] = useState(initialInstruction);
  const [active, setActive] = useState(context.activeComparisonId);
  const [records, setRecords] = useState<readonly PromptComparisonRecord[]>(context.history);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [error, setError] = useState('');
  const historical = calls.find(call => 'call/' + call.id === choice);
  const options = [
    ...calls.map(call => ({ value: 'call/' + call.id, label: `历史调用 #${call.id} · ${call.settings?.model} · 温度 ${call.settings?.temperature}` })),
    ...(models.status === 'ready' ? models.data.filter(m => m.enabled).map(m => ({ value: 'model/' + m.id, label: `当前配置 · ${m.name}（${m.model}）` })) : []),
  ];
  const changed = persona.trim() !== context.persona || instruction.trim() !== initialInstruction;
  async function run() {
    if (!choice || locked.current || !changed || !instruction.trim()) return;
    const [source, rawId] = choice.split('/');
    const model: ComparisonModel = source === 'call' ? { callId: Number(rawId) } : { modelId: Number(rawId) };
    locked.current = true; setBusy(true); onBusy(true); setError('');
    try {
      const record = await comparePrompts(matchId, request.id, { model, persona, instruction,
        ...(context.template && { taskTemplate: instruction }) });
      setRecords(prev => [record, ...prev].slice(0, 10));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      locked.current = false; setBusy(false); onBusy(false);
    }
  }
  return <div className="prompt-editor">
    {context.template && <Link to={{ pathname: '/prompts', search: new URLSearchParams({
      group: context.template.gameKey, key: context.template.name, match: matchId, request: request.id,
    }).toString() }}>在提示词目录查看这条请求</Link>}
    <details><summary>查看原始请求与历史回复</summary>
      <b>固定角色身份</b><pre>{context.fixedIdentity}</pre>
      <b>历史消息</b><pre>{JSON.stringify(request.messages, null, 2)}</pre>
      <b>历史回复</b><pre>{historical
        ? historical.rawResponse ?? historical.error ?? '未记录原文'
        : JSON.stringify(request.output, null, 2) ?? '暂无记录'}</pre>
    </details>
    <label htmlFor="comparison-model">两版共用的模型</label>
    <Select id="comparison-model" aria-label="两版共用的模型" placeholder="选择用于对比的模型" value={choice} onChange={setChoice} disabled={busy} options={options} />
    {models.status === 'error' && <Alert type="warning" title={models.message} action={<Button onClick={models.reload}>重试</Button>} />}
    {models.status === 'ready' && !options.length && <p>请先在模型管理中配置并启用一个模型。</p>}
    <label htmlFor="comparison-persona">玩家人设</label>
    <Input.TextArea id="comparison-persona" value={persona} onChange={e => setPersona(e.target.value)} autoSize={{ minRows: 2, maxRows: 5 }} maxLength={2000} disabled={busy} />
    <label htmlFor="comparison-task">当前任务</label>
    {context.template && <details><summary>本次实际任务与模板变量</summary><pre>{context.instruction}</pre>
      <p>保留模板里的变量，后续会填入对应请求的数据。也可用 <code>{'{{originalTask}}'}</code> 引用该次请求的游戏原始任务。</p></details>}
    <Input.TextArea id="comparison-task" value={instruction} onChange={e => setInstruction(e.target.value)} autoSize={{ minRows: 3, maxRows: 9 }} maxLength={32000} disabled={busy} />
    <Space wrap><Button type="primary" loading={busy} disabled={!choice || !changed || !instruction.trim()} onClick={run}>运行对比（2 次调用）</Button>
      <Button disabled={busy || !changed} onClick={() => { setPersona(context.persona); setInstruction(initialInstruction); }}>还原草稿</Button></Space>
    {error && <Alert type="error" title={error} />}
    {records.length > 0 && <section><h3>最近的对比</h3>
      {records.map((r,i) => <details key={r.id} open={i === 0}><summary>{new Date(r.createdAt).toLocaleString()} · {r.settings.model}</summary>
        <PromptComparisonResult record={r} /><ApplyComparisonButton matchId={matchId} requestId={request.id}
          record={r} active={active === r.id} onApplied={setActive} /></details>)}</section>}
  </div>;
}

export function PromptComparisonForm({ matchId, request, initialCallId, onBusy }: Props) {
  const context = useAsync(() => comparisonContext(matchId, request.id), [matchId, request.id]);
  return <>
    <p><code>{request.id}</code></p>
    {context.status === 'ready' ? <Editor matchId={matchId} request={request} context={context.data} initialCallId={initialCallId} onBusy={onBusy} />
      : context.status === 'error' ? <Alert type="error" title={context.message} action={<Button onClick={context.reload}>重试</Button>} /> : <Spin />}
  </>;
}
