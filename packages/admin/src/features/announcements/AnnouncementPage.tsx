import type { AnnouncementItem } from '@battle/shared';
import { Alert, Button, Grid, Table, Tag, message } from 'antd';
import { useState } from 'react';
import { ListFilterBar, type FilterValues } from '../../components/ListFilterBar';
import { useAsync } from '../../hooks/useAsync';
import { announcements } from '../../services/announcements';
import { AnnouncementEditor } from './AnnouncementEditor';
import './announcements.css';

const PAGE_SIZE = 12;
type Draft = { text: string; revision: number };

export function AnnouncementPage() {
  const catalog = useAsync(announcements.list, []);
  const [filters, setFilters] = useState<FilterValues>({});
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<ReadonlyMap<string, Draft>>(new Map());
  const wide = Grid.useBreakpoint().xxl === true;
  const [page, setPage] = useState(1);
  const [notice, holder] = message.useMessage();
  const items = catalog.status === 'ready' ? catalog.data : [];
  const groups = [...new Set(items.map(item => item.group))];
  const query = filters.q?.trim().toLowerCase() ?? '';
  const rows = items.filter(item =>
    (!filters.group || filters.group === item.group) && (!filters.audience || filters.audience === item.audience) &&
    [item.title, item.defaultText, item.customText, item.group].some(value => value?.toLowerCase().includes(query)));

  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / PAGE_SIZE)));
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const active = pageRows.find(item => item.key === selectedKey) ?? (wide ? pageRows[0] : undefined);
  const draft = active && drafts.get(active.key);

  function changeDraft(item: AnnouncementItem, text: string) {
    setSelectedKey(item.key);
    setDrafts(previous => {
      const next = new Map(previous);
      if (text === (item.customText ?? item.defaultText)) next.delete(item.key);
      else next.set(item.key, { text, revision: previous.get(item.key)?.revision ?? item.revision });
      return next;
    });
  }

  function discardDraft(key: string) {
    setDrafts(previous => {
      const next = new Map(previous);
      next.delete(key);
      return next;
    });
  }

  return <section className={wide ? 'announcement-page is-wide' : 'announcement-page'} aria-label="播报目录">
    {holder}
    <div className="announcement-inventory">
    <div className="announcement-tools">
    <ListFilterBar value={filters} searchPlaceholder="搜索播报名称或文案"
      onChange={next => { setFilters(next); setPage(1); setSelectedKey(null); }}
      selects={[
        { key: 'group', placeholder: '全部环节', options: groups.map(value => ({ value, label: value })) },
        { key: 'audience', placeholder: '全部接收范围', options: [{ value: 'public', label: '全场公开' }, { value: 'private', label: '角色私讯' }] },
      ]} />
    </div>
    {catalog.status === 'error' ? <Alert type="error" title={catalog.message} action={<Button onClick={catalog.reload}>重试</Button>} /> :
      <Table<AnnouncementItem> size="small" rowKey="key" tableLayout="fixed" loading={catalog.status === 'loading'} dataSource={rows}
        rowClassName={item => wide && item.key === active?.key ? 'announcement-selected' : ''}
        pagination={{ current: currentPage, onChange: next => { setPage(next); setSelectedKey(null); }, pageSize: PAGE_SIZE, showSizeChanger: false, hideOnSinglePage: true }}
        locale={{ emptyText: '没有匹配的播报' }}
        columns={[
          { title: '播报名称', dataIndex: 'title', width: wide ? '24%' : 170, render: (title: string, item) => <>
            <button type="button" className="announcement-name" aria-label={`编辑${title}`}
              aria-current={wide && item.key === active?.key ? 'true' : undefined} onClick={() => setSelectedKey(item.key)}>{title}</button>
            <small>{item.group}{drafts.has(item.key) && ' · 未保存'}</small></> },
          { title: '接收范围', width: 110, render: (_, item) => <Tag color={item.audience === 'private' ? 'purple' : 'default'}>{item.audience === 'private' ? '角色私讯' : '全场公开'}</Tag> },
          { title: '当前文案', render: (_, item) => item.customText ?? item.defaultText },
          { title: '状态', width: 90, render: (_, item) => item.customText === null ? '默认' : <Tag color="blue">已自定义</Tag> },
        ]} />}
    </div>
    {active && <AnnouncementEditor key={active.key} item={active} inline={wide}
      draft={draft?.text ?? active.customText ?? active.defaultText} revision={draft?.revision ?? active.revision}
      onDraft={text => changeDraft(active, text)}
      onClose={() => { discardDraft(active.key); if (!wide) setSelectedKey(null); catalog.reload(); }}
      onSaved={saved => {
        discardDraft(saved.key);
        if (!wide) setSelectedKey(null);
        catalog.reload();
        void notice.success('播报已保存');
      }} />}
  </section>;
}
