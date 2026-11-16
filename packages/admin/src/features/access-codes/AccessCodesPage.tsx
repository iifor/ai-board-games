import type { AccessCodeDto } from '@battle/shared';
import { Alert, Button, Flex, Popconfirm, Space, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { ListFilterBar, type FilterValues } from '../../components/ListFilterBar';
import { formatTime } from '../../utils/format';
import { AccessCodeFormModal } from './AccessCodeFormModal';
import { AccessCodeSecretModal } from './AccessCodeSecretModal';
import { STATUS_LABELS } from './constants';
import { useAccessCodes } from './useAccessCodes';
import { filterCodes, usageLabel } from './utils';
import './accessCodes.css';

const STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([value, { label }]) => ({ value, label }));

/** 身份码管理：C 端开局需要的凭据，由管理员生成后发给用户 */
export function AccessCodesPage() {
  const codes = useAccessCodes();
  const [filters, setFilters] = useState<FilterValues>({});
  const rows = codes.list.status === 'ready' ? filterCodes(codes.list.data, filters.q, filters.status) : [];

  const columns: ColumnsType<AccessCodeDto> = [
    { title: '用户名', dataIndex: 'username', ellipsis: true },
    { title: '尾号', dataIndex: 'codeHint', width: 90, render: (hint: string) => <code>…{hint}</code> },
    { title: '状态', dataIndex: 'status', width: 110, render: (status: AccessCodeDto['status']) => <Tag color={STATUS_LABELS[status].color}>{STATUS_LABELS[status].label}</Tag> },
    { title: '已开局 / 上限', key: 'usage', width: 130, render: (_, code) => usageLabel(code) },
    { title: '有效期至', dataIndex: 'expiresAt', width: 180, render: formatTime },
    { title: '最近开局', dataIndex: 'lastUsedAt', width: 180, render: (iso: string | null) => formatTime(iso) || '—' },
    { title: '创建时间', dataIndex: 'createdAt', width: 180, render: formatTime },
    {
      title: '操作', key: 'actions', width: 230, fixed: 'right',
      render: (_, code) => (
        <Space size={8} className="access-code-actions">
          <Button size="small" onClick={() => codes.openEdit(code)}>编辑</Button>
          <Popconfirm title="重新生成后旧码立即失效，确定？" onConfirm={() => codes.regenerate(code)}>
            <Button size="small">重新生成</Button>
          </Popconfirm>
          <Popconfirm title="删除后该码不能再开局，已有对局保留。确定删除？" onConfirm={() => codes.remove(code)}>
            <Button size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <section className="access-code-page" aria-label="身份码">
      <Flex wrap align="center" gap={12} className="access-code-toolbar">
        <ListFilterBar value={filters} onChange={setFilters} searchPlaceholder="搜索用户名或尾号"
          selects={[{ key: 'status', placeholder: '全部状态', options: STATUS_OPTIONS }]} />
        <Button type="primary" className="access-code-create" onClick={codes.openNew}>新建身份码</Button>
      </Flex>
      <p className="access-code-intro">C 端用户输入身份码后才能开局，观战与回放无需身份码。明文码只在生成时显示一次。</p>
      {codes.list.status === 'error' ? <Alert type="error" title={codes.list.message} action={<Button onClick={codes.list.reload}>重试</Button>} /> : null}
      <Table<AccessCodeDto> rowKey="id" loading={codes.list.status === 'loading'} dataSource={rows} columns={columns}
        scroll={{ x: 'max-content' }} pagination={{ pageSize: 20, hideOnSinglePage: true }} />
      {codes.editor ? (
        <AccessCodeFormModal editing={codes.editor === 'new' ? null : codes.editor} saving={codes.saving}
          onSave={codes.save} onCancel={codes.closeEditor} />
      ) : null}
      {codes.revealed ? <AccessCodeSecretModal revealed={codes.revealed} onClose={codes.closeRevealed} /> : null}
    </section>
  );
}
