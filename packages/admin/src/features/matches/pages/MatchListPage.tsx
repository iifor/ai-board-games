import { formatMatchTitle, type MatchStatus, type MatchSummaryDto } from '@battle/shared';
import { Alert, App, Button, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAsync } from '../../../hooks/useAsync';
import { errorMessage } from '../../../services/http';
import { deleteMatch, listMatches } from '../../../services/matches';
import { formatTime } from '../../../utils/format';
import { CreateDebugMatchModal } from '../components/CreateDebugMatchModal';
import { STATUS_LABELS } from '../utils';

export function MatchListPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [status, setStatus] = useState<MatchStatus | undefined>();
  const [debug, setDebug] = useState<boolean | undefined>();
  const [creating, setCreating] = useState(false);
  const matches = useAsync(() => listMatches({ ...(status ? { status } : {}), ...(debug === undefined ? {} : { debug }) }), [status, debug]);

  const remove = async (id: string) => {
    try {
      await deleteMatch(id);
      message.success('已删除');
      matches.reload();
    } catch (error) {
      message.error(errorMessage(error));
    }
  };

  return (
    <section>
      <Space style={{ width: '100%', justifyContent: 'space-between', margin: '16px 0' }} wrap>
        <Typography.Title level={3} style={{ margin: 0 }}>对局与调试</Typography.Title>
        <Space wrap>
          <Select allowClear placeholder="全部状态" style={{ width: 130 }} value={status} onChange={setStatus}
            options={Object.entries(STATUS_LABELS).map(([value, { label }]) => ({ value, label }))} />
          <Select allowClear placeholder="全部类型" style={{ width: 130 }} value={debug} onChange={setDebug}
            options={[{ value: true, label: '调试局' }, { value: false, label: '公开对局' }]} />
          <Button onClick={matches.reload}>刷新</Button>
          <Button type="primary" onClick={() => setCreating(true)}>创建调试局</Button>
        </Space>
      </Space>
      {matches.status === 'error' ? <Alert type="error" title={matches.message} /> : null}
      <Table<MatchSummaryDto>
        rowKey="id"
        loading={matches.status === 'loading'}
        dataSource={matches.status === 'ready' ? matches.data : []}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        columns={[
          { title: '对局', key: 'title', render: (_, match) => <Link to={`/matches/${match.id}`}>{formatMatchTitle(match)}</Link> },
          { title: '状态', dataIndex: 'status', render: (value: MatchStatus) => <Tag color={STATUS_LABELS[value].color}>{STATUS_LABELS[value].label}</Tag> },
          { title: '类型', key: 'type', render: (_, match) => (match.debug ? <Tag color="orange">{match.scripted ? '调试 · 脚本化' : '调试'}</Tag> : <Tag>公开</Tag>) },
          { title: '结果', key: 'result', render: (_, match) => match.result?.winnerLabel ?? '—' },
          { title: '创建时间', dataIndex: 'createdAt', render: (value: string) => formatTime(value) },
          {
            title: '操作', key: 'actions', render: (_, match) => (
              <Popconfirm title="删除对局及其全部记录？" onConfirm={() => remove(match.id)}><Button size="small" danger>删除</Button></Popconfirm>
            ),
          },
        ]}
      />
      <CreateDebugMatchModal open={creating} onClose={() => setCreating(false)} onCreated={(id) => navigate(`/matches/${id}`)} />
    </section>
  );
}
