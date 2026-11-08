import type { TraceMatchDto } from '@battle/shared';
import { Alert, Button, Space, Table, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAsync } from '../../hooks/useAsync';
import { listTraces } from '../../services/traces';
import { onAdminViewResumed, onTraceRemoved } from '../../services/traceInvalidation';
import { DeleteTraceButton } from './DeleteTraceButton';
import { useTraceTitle } from './useTraceTitle';
import { formatTime } from '../../utils/format';
import { STATUS_LABELS } from '../matches/utils';

const PAGE_SIZE = 30;

export function TraceListPage() {
  const title = useTraceTitle();
  const [page, setPage] = useState(0);
  const list = useAsync(() => listTraces(page * PAGE_SIZE, PAGE_SIZE + 1), [page]);
  useEffect(() => onTraceRemoved(list.invalidate), [list.invalidate]);
  useEffect(() => onAdminViewResumed(list.invalidate), [list.invalidate]);
  const matches = list.status === 'ready' ? list.data : [];
  return <section>
    <Typography.Title level={3}>整局调用链</Typography.Title>
    {list.status === 'error' && <Alert type="error" title={list.message} />}
    <Table<TraceMatchDto> rowKey="id" dataSource={matches.slice(0, PAGE_SIZE)} loading={list.status === 'loading'}
      pagination={false} columns={[
        { title: '对局', render: (_, m) => <><Link to={'/traces/' + m.id}>{title(m)}</Link><small className="trace-match-id">{m.id}</small></> },
        { title: '驱动', responsive: ['md'], render: (_, m) => m.scripted ? '脚本' : '模型' },
        { title: '状态', render: (_, m) => STATUS_LABELS[m.status].label },
        { title: '创建时间', responsive: ['md'], render: (_, m) => formatTime(m.createdAt) },
        { title: '操作', render: (_, m) => <DeleteTraceButton id={m.id} /> },
      ]} />
    <Space><Button onClick={list.reload}>刷新</Button>
      <Button disabled={page === 0} onClick={() => setPage(page - 1)}>上一页</Button>
      <span>第 {page + 1} 页</span><Button disabled={matches.length <= PAGE_SIZE} onClick={() => setPage(page + 1)}>下一页</Button>
    </Space>
  </section>;
}
