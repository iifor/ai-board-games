import type { PromptCatalogItem } from '@battle/shared';
import { RightOutlined, SearchOutlined } from '@ant-design/icons';
import { Alert, Button, Empty, Grid, Input, Segmented, Select, Table } from 'antd';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAsync } from '../../hooks/useAsync';
import { promptCatalog } from '../../services/promptCatalog';
import { PromptDetail } from './PromptDetail';
import './prompts.css';

const PAGE_SIZE = 15;

export function PromptCatalogPage() {
  const catalog = useAsync(promptCatalog.list, []);
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState<string>();
  const [kind, setKind] = useState<PromptCatalogItem['kind']>();
  const [pilots, setPilots] = useState(false);
  const [page, setPage] = useState(1);
  const wide = Grid.useBreakpoint().xxl === true;
  const [params, setParams] = useSearchParams();
  const selectedGroup = params.get('group');
  const selectedKey = params.get('key');
  const items = catalog.status === 'ready' ? catalog.data : [];
  const groups = [...new Map(items.map(i => [i.group, i.groupTitle]))].map(([value, label]) => ({ value, label }));
  const kinds = [...new Set(items.map(i => i.kind))].map(value => ({ value, label: value }));
  const term = search.trim().toLowerCase();
  const rows = items.filter(i => (!group || group === i.group) && (!kind || i.kind === kind) && (!pilots || i.pilot)
    && [i.key, i.title, i.kind, i.groupTitle, ...i.usage, ...i.variables].some(v => v.toLowerCase().includes(term)));
  const filtered = Boolean(term || kind || group || pilots);
  const index = rows.findIndex(i => i.group === selectedGroup && i.key === selectedKey);
  const outsideFilter = wide && filtered && catalog.status === 'ready' && index < 0;
  const explicit = selectedGroup && selectedKey && !outsideFilter;
  const currentPage = wide && index >= 0 ? Math.floor(index / PAGE_SIZE) + 1 : page;
  const active = explicit ? { group: selectedGroup, key: selectedKey } : wide ? rows[(currentPage - 1) * PAGE_SIZE] : undefined;
  useEffect(() => {
    if (outsideFilter && selectedKey && selectedGroup) setParams({}, { replace: true });
  }, [outsideFilter, selectedKey, selectedGroup, setParams]);
  const resetFilters = () => { setSearch(''); setGroup(undefined); setKind(undefined); setPilots(false); setPage(1); };
  return <section aria-label="提示词目录" className={wide ? 'prompt-catalog prompt-wide' : 'prompt-catalog'}>
    <div className="prompt-inventory">
    <div className="prompt-inventory-tools">
    <div className="prompt-filters">
      <Segmented aria-label="模板范围" value={pilots ? 'pilots' : 'all'} onChange={value => { setPilots(value === 'pilots'); setPage(1); }}
        options={[{ value: 'all', label: '全部模板' }, { value: 'pilots', label: '支持模型对比' }]} />
      <div className="prompt-search-controls"><Input aria-label="搜索提示词" prefix={<SearchOutlined />} placeholder="搜索名称、阶段或变量" allowClear value={search}
        onChange={e => { setSearch(e.target.value); setPage(1); }} />
      <Select aria-label="来源" placeholder="全部来源" allowClear value={group} options={groups} onChange={value => { setGroup(value); setPage(1); }} />
      <Select aria-label="用途" placeholder="全部用途" allowClear value={kind} options={kinds} onChange={value => { setKind(value); setPage(1); }} /></div>
    </div>
    <div className="prompt-row-count"><span role="status">{catalog.status === 'ready' ? `共 ${rows.length} 个模板` : catalog.status === 'loading' ? '正在加载模板…' : ''}</span>
      {filtered && rows.length > 0 && <Button size="small" type="link" onClick={resetFilters}>清除筛选</Button>}</div>
    </div>
    {catalog.status === 'error' && <Alert type="error" title={catalog.message} action={<Button onClick={catalog.reload}>重试</Button>} />}
    {catalog.status !== 'error' && <Table<PromptCatalogItem> size="small" dataSource={rows} loading={catalog.status === 'loading'} rowKey={i => i.group + '/' + i.key}
      rowClassName={i => wide && i.group === active?.group && i.key === active.key ? 'prompt-active-row' : ''}
      tableLayout="fixed" pagination={{ current: currentPage, onChange: value => { setPage(value); if (wide && selectedKey) setParams({}); }, pageSize: PAGE_SIZE, showSizeChanger: false, hideOnSinglePage: true, responsive: true }}
      locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={items.length ? '没有符合条件的模板' : '暂无模板'}>
        {items.length > 0 && <Button onClick={resetFilters}>清除筛选</Button>}</Empty> }}
      columns={[
        { title: '提示词', render: (_, i) => <Link className="prompt-entry" aria-current={wide && i.group === active?.group && i.key === active.key ? 'true' : undefined} to={{ search: new URLSearchParams({ group: i.group, key: i.key }).toString() }}>
          <span className="prompt-entry-name">{i.title}<RightOutlined /></span>{i.pilot && <span className="prompt-badge">模型对比</span>}
          <small>{i.key}</small></Link> },
        { title: '来源', dataIndex: 'groupTitle', width: '23%', render: (value, i) => <>{value}<small className="prompt-mobile-kind">{i.kind}</small></> },
        { title: '用途', dataIndex: 'kind', width: '20%', responsive: ['sm'] },
      ]} />}
    </div>
    {active ? <PromptDetail key={active.group + '/' + active.key} group={active.group} name={active.key} inline={wide}
      matchId={explicit ? params.get('match') : null} requestId={explicit ? params.get('request') : null} onClose={() => setParams({})} />
      : wide && <aside className="prompt-inspector prompt-inspector-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={catalog.status === 'loading' ? '正在加载模板…' : '暂无可预览的模板'} /></aside>}
  </section>;
}
