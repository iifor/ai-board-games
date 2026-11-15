import type { PromptComparisonRecord } from '@battle/shared';
import { Alert, Button, Popconfirm } from 'antd';
import { useState } from 'react';
import { errorMessage } from '../../services/http';
import { applyComparison } from '../../services/traces';

export function ApplyComparisonButton({ matchId, requestId, record, active, onApplied }: {
  matchId: string; requestId: string; record: PromptComparisonRecord; active: boolean; onApplied: (id: number) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const version = record.publication;
  if (!version || record.modified.error || record.modified.raw === null) return null;
  async function publish() {
    setSaving(true); setError('');
    try { const result = await applyComparison(matchId, requestId, record.id); onApplied(result.comparisonId); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setSaving(false); }
  }
  return <div>
    <Popconfirm title="应用这次测试的提示词？" description={<>
      <p>{version.gameKey} · {version.variantKey ?? '默认板子'} · {version.templateName}</p>
      <p>应用后，新创建的同玩法、同板子对局会使用此版本。</p>
      <p>{version.persona === null ? '每位玩家沿用自己的人设。' : '这些请求将统一使用本次草稿的人设。'}</p>
    </>} okText="应用" cancelText="取消" onConfirm={publish} disabled={active}>
      <Button disabled={active} loading={saving}>{active ? '此版本已应用' : '应用这版提示词'}</Button>
    </Popconfirm>
    {error && <Alert type="error" title={error} />}
  </div>;
}
