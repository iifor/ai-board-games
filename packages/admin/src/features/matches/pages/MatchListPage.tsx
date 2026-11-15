import { formatMatchTitle, type MatchStatus, type MatchSummaryDto } from '@battle/shared';
import { Alert, App, Button, Popconfirm, Select, Space, Table, Tag } from 'antd';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useAsync } from '../../../hooks/useAsync';
import { errorMessage } from '../../../services/http';
import { deleteMatch, listMatches } from '../../../services/matches';
import { formatTime } from '../../../utils/format';
import { CreateDebugMatchModal } from '../components/CreateDebugMatchModal';
import { matchTypeLabel, STATUS_LABELS } from '../utils';
import { ReplayImportModal } from '../../replay-imports/ReplayImportModal';

const PAGE_SIZE = 20;

export function MatchListPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = Object.keys(STATUS_LABELS).find((key): key is MatchStatus => key === params.get('status'));
  const debugParam = params.get('debug');
  const debug = debugParam === 'true' ? true : debugParam === 'false' ? false : undefined;
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(() => params.get('import') === '1' || params.get('tab') === 'import');
  const sourceValue = params.get('source');
  const source = sourceValue === 'normal' || sourceValue === 'debug' || sourceValue === 'import' ? sourceValue : undefined;
  const pageValue = Number(params.get('page'));
  const page = Number.isSafeInteger(pageValue) && pageValue > 0 ? pageValue : 1;
  function setFilter(key: string, value?: string) {
    const next = new URLSearchParams(params);
    next.delete('page');
    if (value === undefined) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  }
  const setPage = (value: number) => setFilter('page', value > 1 ? String(value) : undefined);
  const matches = useAsync(() => listMatches({ limit: PAGE_SIZE + 1, offset: (page - 1) * PAGE_SIZE,
    ...(status ? { status } : {}), ...(source ? {source} : debug === undefined ? {} : { debug }) }), [status, source, debug, page]);
  const rows = matches.status === 'ready' ? matches.data : [];

  const remove = async (id: string) => {
    try {
      await deleteMatch(id);
      message.success('已删除');
      if (rows.length === 1 && page > 1) setPage(page - 1);
      else matches.reload();
    } catch (error) {
      message.error(errorMessage(error));
    }
  };

  return (
    <section>
      <Space wrap style={{ marginBottom: 12 }}>
        <Select allowClear aria-label="按对局状态筛选" placeholder="全部状态" style={{ width: 130 }} value={status} onChange={value => setFilter('status', value)}
          options={Object.entries(STATUS_LABELS).map(([value, { label }]) => ({ value, label }))} />
        <Select allowClear aria-label="按对局来源筛选" placeholder="全部来源" style={{ width: 130 }} value={source} onChange={value => {
          const next = new URLSearchParams(params);
          next.delete('debug'); next.delete('page');
          if (value) next.set('source',value); else next.delete('source');
          setParams(next,{replace:true});
        }} options={[{value:'normal',label:'正常'},{value:'debug',label:'调试'},{value:'import',label:'导入'}]} />
        <Button onClick={matches.reload}>刷新</Button>
        <Button onClick={() => setImporting(true)}>导入对局</Button>
        <Button type="primary" onClick={() => setCreating(true)}>创建调试局</Button>
      </Space>
      {matches.status === 'error' ? <Alert type="error" title={matches.message} /> : null}
      <Table<MatchSummaryDto>
        rowKey="id"
        scroll={{ x: true }}
        loading={matches.status === 'loading'}
        dataSource={rows.slice(0, PAGE_SIZE)}
        pagination={false}
        columns={[
          { title: '对局', key: 'title', render: (_, match) => <Link to={`/matches/${match.id}`}>{formatMatchTitle(match)}</Link> },
          { title: '状态', dataIndex: 'status', render: (value: MatchStatus) => <Tag color={STATUS_LABELS[value].color}>{STATUS_LABELS[value].label}</Tag> },
          { title: '来源', key: 'source', width: 110, render: (_, match) => match.importTitle
            ? <Tag color="blue">导入</Tag> : match.debug ? <Tag color="orange" title={matchTypeLabel(match)}>调试</Tag> : <Tag>正常</Tag> },
          { title: '结果', key: 'result', responsive: ['sm'], render: (_, match) => match.result?.winnerLabel ?? '—' },
          { title: '创建时间', dataIndex: 'createdAt', responsive: ['md'], render: (value: string) => formatTime(value) },
          {
            title: '操作', key: 'actions', render: (_, match) => (
              <Space wrap size="small"><Link to={`/matches/${match.id}`}>详情</Link>
                <Popconfirm title="删除对局及其全部记录？" onConfirm={() => remove(match.id)}><Button size="small" danger>删除</Button></Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      {(page > 1 || rows.length > PAGE_SIZE) && <Space style={{ marginTop: 12 }}>
        <Button disabled={page === 1} onClick={() => setPage(page - 1)}>上一页</Button>
        <span>第 {page} 页</span>
        <Button disabled={rows.length <= PAGE_SIZE} onClick={() => setPage(page + 1)}>下一页</Button>
      </Space>}
      <CreateDebugMatchModal open={creating} onClose={() => setCreating(false)} onCreated={(id) => navigate(`/matches/${id}`)} />
      {importing && <ReplayImportModal onClose={() => {
        setImporting(false);
        const next = new URLSearchParams(params); next.delete('import'); next.delete('tab'); setParams(next,{replace:true});
      }} onImported={() => {
        setImporting(false);
        setParams({source:'import'},{replace:true});
        matches.reload();
      }} />}
    </section>
  );
}
