import { Alert, Button, Select } from 'antd';
import { useAsync } from '../../hooks/useAsync';
import { modelsApi } from '../../services/resources';

interface Props {
  model: number | undefined;
  onModelChange: (model: number) => void;
  onCompare: () => void;
  busy: 'preview' | 'compare' | 'save' | undefined;
  rendered: string | undefined;
  original: string;
}

export function DraftModelControls({ model, onModelChange, onCompare, busy, rendered, original }: Props) {
  const models = useAsync(modelsApi.list, []);
  const options = models.status === 'ready'
    ? models.data.filter(m => m.enabled).map(m => ({ value: m.id, label: m.name + ' · ' + m.model }))
    : [];
  return <div className="prompt-model">
    <label htmlFor="trial-model">对比模型</label>
    <div className="prompt-model-controls">
      <Select id="trial-model" showSearch optionFilterProp="label" placeholder="选择两版共用的模型"
        value={model ?? null} disabled={!!busy} options={options} onChange={onModelChange} />
      <Button type="primary" loading={busy === 'compare'} onClick={onCompare}
        disabled={!!busy || model === undefined || rendered === undefined || rendered === original}>
        运行对比（2 次调用）
      </Button>
    </div>
    {rendered === undefined && <p>修改并预览草稿后，可用同一模型比较两版回复。</p>}
    {models.status === 'error' && <Alert type="warning" title={models.message} action={<Button onClick={models.reload}>重试</Button>} />}
    {models.status === 'ready' && !options.length && <p>请先在模型管理中启用一个模型。草稿仍可预览。</p>}
  </div>;
}
