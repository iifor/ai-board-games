import type { ModelImportResult, ProviderDto } from '@battle/shared';
import { Alert, Button, Checkbox, Empty, Input, Modal, Space, Spin, Typography } from 'antd';
import { useState } from 'react';
import { useAsync } from '../../hooks/useAsync';
import { errorMessage } from '../../services/http';
import { modelActions } from '../../services/resources';

interface Props {
  readonly provider: ProviderDto;
  readonly onClose: () => void;
  readonly onManual: () => void;
  readonly onImported: (result: ModelImportResult) => void;
}

export function ProviderModelPicker({ provider, onClose, onManual, onImported }: Props) {
  const catalog = useAsync(() => modelActions.catalog(provider.id), [provider.id]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const rows = catalog.status === 'ready' ? catalog.data : [];
  const visible = rows.filter(row => row.id.toLowerCase().includes(query.trim().toLowerCase()));
  async function submit() {
    if (saving || !selected.length) return;
    setSaving(true);
    setError('');
    try {
      onImported(await modelActions.importSelected(provider.id, { modelIds: selected }));
    } catch (cause) {
      setError(errorMessage(cause));
      setSaving(false);
    }
  }
  return <Modal open title={`${provider.name} · 选择模型`} onCancel={onClose} closable={!saving}
    maskClosable={!saving} keyboard={!saving} footer={<Space wrap>
      <Button type="link" disabled={saving} onClick={onManual}>手动输入模型 ID</Button>
      <Button disabled={saving} onClick={onClose}>取消</Button>
      <Button type="primary" loading={saving} disabled={!selected.length || selected.length > 1000} onClick={submit}>添加所选模型（{selected.length}）</Button>
    </Space>}>
    {catalog.status === 'loading' && <Space><Spin size="small" />正在拉取模型列表…</Space>}
    {catalog.status === 'error' && <Alert type="warning" title={catalog.message} action={<Button onClick={catalog.reload}>重试</Button>} />}
    {catalog.status === 'ready' && (rows.length ? <>
      <Input.Search allowClear aria-label="搜索模型 ID" placeholder="搜索模型 ID" value={query} onChange={e => setQuery(e.target.value)} />
      <div style={{ maxHeight: '45vh', overflowY: 'auto', marginBlock: 12 }}>
        {visible.map(row => <div key={row.id} style={{ paddingBlock: 4, overflowWrap: 'anywhere' }}>
          <Checkbox checked={row.added || selected.includes(row.id)} disabled={saving || row.added || row.id.length > 128}
            onChange={e => setSelected(prev => e.target.checked ? [...prev, row.id] : prev.filter(id => id !== row.id))}>
            {row.id} {row.added ? <Typography.Text type="secondary">已添加</Typography.Text>
              : row.id.length > 128 ? <Typography.Text type="secondary">超过 128 字符</Typography.Text> : null}
          </Checkbox>
        </div>)}
        {!visible.length && <Empty description="没有匹配的模型" />}
      </div>
    </> : <Empty description="供应商返回了空模型列表" />)}
    {selected.length > 1000 && <Alert type="warning" title="每次最多添加 1000 个模型，请分批选择" />}
    {error && <Alert type="error" title={error} />}
  </Modal>;
}
