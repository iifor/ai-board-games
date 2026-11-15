import type { PrivateActionTemplate } from '@battle/shared';
import { Alert, Button, Input, Table } from 'antd';
import { useState } from 'react';
import { useAsync } from '../../hooks/useAsync';
import { perspectives } from '../../services/perspectives';
import { PromptDetail } from '../prompts/PromptDetail';

export function PrivateActions() {
  const catalog = useAsync(perspectives.actions, []);
  const [query, search] = useState('');
  const [editing, edit] = useState<string | null>(null);
  if (catalog.status === 'error') return <Alert type="error" title={catalog.message} action={<Button onClick={catalog.reload}>重试</Button>} />;
  const rows = catalog.status === 'ready' ? catalog.data.filter(a => (a.role + a.title + a.template).includes(query.trim())) : [];
  return <section className="perspective-panel">
    <Input.Search aria-label="搜索角色或行动" placeholder="搜索角色或行动" allowClear value={query} onChange={e => search(e.target.value)} />
    <p>点击行动可编辑法官发给该座位的指令。要查看某一局的收件人、实际指令和行动结果，请打开该局详情中的「对局视角」。</p>
    <Table<PrivateActionTemplate> dataSource={rows} rowKey="phase" size="small" loading={catalog.status === 'loading'}
      pagination={{ pageSize: 12, showSizeChanger: false, hideOnSinglePage: true }}
      columns={[
        { title: '行动角色', dataIndex: 'role', width: '32%' },
        { title: '私密指令', render: (_, row) => <Button type="link" onClick={() => edit(row.template)}>{row.title}</Button> },
      ]} />
    {editing && <PromptDetail key={editing} group="werewolf" name={editing} inline={false} matchId={null} requestId={null} onClose={() => edit(null)} />}
  </section>;
}
