import type { PromptComparisonRecord, PromptTrial } from '@battle/shared';

export function Trial({ title, trial }: { title: string; trial: PromptTrial }) {
  return <section className="prompt-trial">
    <h4>{title}</h4>
    <p>{trial.latencyMs} ms · {trial.usage ? `输入 ${trial.usage.promptTokens} / 输出 ${trial.usage.completionTokens} tokens` : '用量未返回'}</p>
    {trial.error ? <p role="alert">{trial.error}</p> : <>
      <p>{trial.issues.length ? '格式或目标校验未通过' : '格式与目标校验通过'}</p>
      {trial.issues.length > 0 && <ul>{trial.issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>}
      <pre>{trial.raw}</pre>
    </>}
  </section>;
}

export function PromptComparisonResult({ record }: { record: PromptComparisonRecord }) {
  const { settings } = record;
  return <section className="prompt-result">
    <p><b>{settings.model}</b> · 供应商 #{settings.providerId} · 温度 {settings.temperature} · 最大输出 {settings.maxTokens} tokens</p>
    <details><summary>本次草稿</summary><b>人设</b><pre>{record.draft.persona || '（空）'}</pre><b>当前任务</b><pre>{record.draft.instruction}</pre>
      {record.publication && <><b>可应用的任务模板</b><pre>{record.publication.source}</pre></>}</details>
    <div className="prompt-trials"><Trial title="原版 · 本次生成" trial={record.original} /><Trial title="修改版 · 本次生成" trial={record.modified} /></div>
  </section>;
}
