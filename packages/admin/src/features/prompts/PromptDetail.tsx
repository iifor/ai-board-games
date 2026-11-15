import type { CatalogPreview, PromptCatalogDetail, PromptExampleRef } from '@battle/shared';
import { Alert, Button, Drawer, Select, Spin, Tabs } from 'antd';
import { useEffect, useState } from 'react';
import { useAsync } from '../../hooks/useAsync';
import { promptCatalog } from '../../services/promptCatalog';
import { onAdminViewResumed, onTraceRemoved } from '../../services/traceInvalidation';
import { TemplateDraft } from './TemplateDraft';
import { PromptText } from './PromptText';

interface DraftState {
  onSaved: () => void;
  mode: string;
  setMode: (mode: string) => void;
  drafts: ReadonlyMap<string, string>;
  changeDraft: (baseline: string, text: string) => void;
}

function Sample({ detail, example, ...draftState }: { detail: PromptCatalogDetail; example: PromptExampleRef } & DraftState) {
  const { group, key } = detail.item;
  const view = useAsync(() => promptCatalog.preview(group, key, example), [group, key, example]);
  useEffect(() => example.kind === 'history' ? onAdminViewResumed(view.invalidate) : undefined, [example.kind, view.invalidate]);
  if (view.status === 'loading') return <Spin />;
  if (view.status === 'error') return <Alert type="error" title={view.message} action={<Button onClick={view.reload}>重试</Button>} />;
  return <SampleContents detail={detail} example={example} view={view.data} {...draftState} />;
}

function SampleContents({ detail, example, view, drafts, changeDraft, mode, setMode, onSaved }: { detail: PromptCatalogDetail; example: PromptExampleRef; view: CatalogPreview } & DraftState) {
  const baseline = view.source;
  const preview = <div className="prompt-preview">
    <div className="prompt-columns">
      <PromptText variant="source" title={example.kind === 'history' ? '请求当时的模板' : '模板原文'} text={baseline ?? '此历史请求未保存模板原文。'} />
      <PromptText variant="rendered" title={example.kind === 'history' ? '当时实际发出的内容' : '替换后的内容'} text={view.rendered} template={baseline ?? undefined} />
    </div>
    {example.kind === 'history' && view.source !== detail.source && <details><summary>目录当前模板</summary><pre>{detail.source}</pre></details>}
    {view.layers && <details><summary>查看此请求的六层提示词</summary>{Object.entries(view.layers).map(([k, v]) =>
      <div key={k}><b>{{ platform: '平台契约', rules: '游戏规则', identity: '身份与人设', history: '可见历史', instruction: '当前任务', output: '输出要求' }[k] ?? k}</b><pre>{v}</pre></div>)}</details>}
    {baseline === null && <p>这条历史请求只保存了最终文本。请选择内置样例编辑草稿。</p>}
  </div>;
  if (baseline === null) return preview;
  return <Tabs activeKey={mode} onChange={setMode} items={[
    { key: 'preview', label: '模板预览', children: preview },
    { key: 'draft', label: '编辑草稿', children: <TemplateDraft detail={detail} example={example} baseline={baseline} onSaved={onSaved}
      original={view.rendered} source={drafts.get(baseline) ?? baseline} changeSource={text => changeDraft(baseline, text)} /> },
  ]} />;
}

function Examples({ detail, matchId, requestId, onSaved }: { detail: PromptCatalogDetail; matchId: string | null; requestId: string | null; onSaved: () => void }) {
  const options = [...detail.examples];
  let index = options.findIndex(o => o.ref.kind === 'history' && o.ref.matchId === matchId && o.ref.requestId === requestId);
  if (matchId && requestId && index < 0) {
    index = options.length;
    options.push({ label: '调用链中的请求 · ' + requestId, ref: { kind: 'history', matchId, requestId } });
  }
  const [choice, setChoice] = useState(Math.max(0, index));
  const [mode, setMode] = useState('preview');
  const [drafts, setDrafts] = useState<ReadonlyMap<string, string>>(new Map());
  const changeDraft = (baseline: string, text: string) => setDrafts(prev => new Map(prev).set(baseline, text));
  function saved() {
    setDrafts(new Map());
    onSaved();
  }
  const active = options[choice];
  return <div className="prompt-detail">
    <div className="prompt-meta"><span>{detail.item.groupTitle}</span><span>{detail.item.kind}</span><code>{detail.item.key}</code></div>
    {active ? <><div className="prompt-context"><label htmlFor="prompt-example">预览上下文</label><Select id="prompt-example" value={choice} onChange={setChoice}
      options={options.map((o, value) => ({ value, label: o.label }))} /></div>
      <Sample key={JSON.stringify([active.ref, detail.revision])} detail={detail} example={active.ref} drafts={drafts} changeDraft={changeDraft} mode={mode} setMode={setMode} onSaved={saved} /></>
      : <><PromptText variant="source" title="模板原文" text={detail.source} /><Alert type="info" title="当前没有适用的样例上下文。" /></>}
  </div>;
}

interface Props { group: string; name: string; inline: boolean; matchId: string | null; requestId: string | null; onClose: () => void }
export function PromptDetail({ group, name, inline, matchId, requestId, onClose }: Props) {
  const detail = useAsync(() => promptCatalog.detail(group, name), [group, name]);
  useEffect(() => onTraceRemoved(() => detail.invalidate()), [detail.invalidate]);
  useEffect(() => onAdminViewResumed(detail.reload), [detail.reload]);
  const title = detail.status === 'ready' ? detail.data.item.title : '模板详情';
  const content = detail.status === 'loading' ? <Spin /> : detail.status === 'error'
      ? <Alert type="error" title={detail.message} action={<Button onClick={detail.reload}>重试</Button>} />
      : <Examples key={JSON.stringify([matchId, requestId, detail.data.examples])} detail={detail.data} matchId={matchId} requestId={requestId} onSaved={detail.reload} />;
  return inline ? <aside className="prompt-inspector" aria-label="模板详情">
    <h2>{title}</h2>{content}</aside>
    : <Drawer open rootClassName="prompt-drawer" title={title} size="min(940px, 100vw)" onClose={onClose}>{content}</Drawer>;
}
