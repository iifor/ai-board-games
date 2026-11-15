import { Alert, Button, Spin } from 'antd';
import { useState } from 'react';
import { useAsync } from '../../hooks/useAsync';
import { perspectives } from '../../services/perspectives';
import { PromptDetail } from '../prompts/PromptDetail';

export function RelatedActions({ callKey }: { callKey: string }) {
  const catalog = useAsync(perspectives.actions, []);
  const [editing, edit] = useState<string | null>(null);
  if (catalog.status === 'loading') return <Spin size="small" />;
  if (catalog.status === 'error') return <Alert type="error" title={catalog.message}
    action={<Button onClick={catalog.reload}>重试</Button>} />;
  const actions = new Map(catalog.data.filter(item => item.callKeys.includes(callKey)).map(item => [item.template, item]));
  return <div><strong>对应私密行动</strong>
    {actions.size ? Array.from(actions.values(), item => <Button key={item.template} type="link"
      onClick={() => edit(item.template)}>{item.title}</Button>) : <p>该环节没有独立的行动请求。</p>}
    {editing && <PromptDetail key={editing} group="werewolf" name={editing} inline={false}
      matchId={null} requestId={null} onClose={() => edit(null)} />}
  </div>;
}
