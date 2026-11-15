import type { CatalogComparison, PromptCatalogDetail, PromptExampleRef } from '@battle/shared';
import { Alert, App, Button, Input, Space } from 'antd';
import { useRef, useState } from 'react';
import { errorMessage } from '../../services/http';
import { promptCatalog } from '../../services/promptCatalog';
import { Trial } from '../traces/PromptComparisonResult';
import { PromptText } from './PromptText';
import { DraftModelControls } from './DraftModelControls';
import '../traces/promptComparison.css';

interface Props {
  detail: PromptCatalogDetail; example: PromptExampleRef; baseline: string; original: string;
  source: string; changeSource: (text: string) => void;
  onSaved: () => void;
}
export function TemplateDraft({ detail, example, baseline, original, source, changeSource, onSaved }: Props) {
  const { group, key } = detail.item;
  const { message } = App.useApp();
  const [rendered, setRendered] = useState<string>();
  const [result, setResult] = useState<CatalogComparison>();
  const [model, setModel] = useState<number>();
  const [busy, setBusy] = useState<'preview' | 'compare' | 'save'>();
  const [error, setError] = useState('');
  const locked = useRef(false);
  function edit(value: string) {
    changeSource(value); setRendered(undefined); setResult(undefined); setError('');
  }
  async function run(mode: 'preview' | 'compare' | 'save') {
    if (locked.current) return;
    locked.current = true; setBusy(mode); setError(''); setResult(undefined);
    try {
      if (mode === 'preview') {
        const response = await promptCatalog.preview(group, key, example, source);
        setRendered(response.draft ?? undefined);
      } else if (mode === 'save') {
        await promptCatalog.save(group, key, source, detail.revision);
        message.success(detail.item.kind === '工具指令' ? '已保存，下次工具调用生效' : '已保存，下局生效');
        onSaved();
      } else if (model !== undefined) {
        setResult(await promptCatalog.compare(group, key, example, source, model));
      }
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(undefined); locked.current = false; }
  }
  return <section className="template-draft">
    <div className="prompt-section-heading"><h3><label htmlFor="template-source">模板草稿</label></h3>
      <span>{source === baseline ? '与原版一致' : '已修改'}</span></div>
    <Input.TextArea id="template-source" value={source} maxLength={8000} disabled={!!busy} autoSize={{ minRows: 3, maxRows: 12 }}
      onChange={e => edit(e.target.value)} />
    <Space wrap><Button type="primary" disabled={!!busy || !source.trim() || source === detail.source} loading={busy === 'save'}
      onClick={() => run('save')}>保存</Button>
      <Button disabled={!!busy || !source.trim() || source === baseline} loading={busy === 'preview'} onClick={() => run('preview')}>预览草稿</Button>
      <Button type="text" disabled={!!busy || source === baseline} onClick={() => edit(baseline)}>还原</Button>
      {detail.defaultSource !== detail.source && <Button type="text" disabled={!!busy || source === detail.defaultSource}
        onClick={() => edit(detail.defaultSource)}>恢复默认</Button>}
      <span>{detail.item.kind === '工具指令' ? '保存后，下次调用生效' : '保存后，下局生效'}</span>
    </Space>
    {rendered !== undefined && <section><div className="prompt-columns">
      <PromptText variant="rendered" title="原版替换后的内容" text={original} template={baseline} />
      <PromptText variant="rendered" title="草稿替换后的内容" text={rendered} template={source} />
      </div>
      {rendered === original && <p>这份草稿在当前上下文中与原版相同。</p>}</section>}
    {detail.item.pilot && <DraftModelControls model={model} busy={busy} rendered={rendered} original={original}
      onModelChange={value => { setModel(value); setResult(undefined); }} onCompare={() => run('compare')} />}
    {error && <Alert type="error" title={error} />}
    {result && <section><h3>对比结果</h3><p>{result.settings.model} · 温度 {result.settings.temperature} · 最大输出 {result.settings.maxTokens} tokens</p>
      <div className="prompt-trials"><Trial title="原版回复" trial={result.original} /><Trial title="草稿回复" trial={result.modified} /></div></section>}
  </section>;
}
