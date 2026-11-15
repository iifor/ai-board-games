import { Alert, App, Button, Flex, Popconfirm, Space, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState, type ReactNode } from 'react';
import { ListFilterBar, type FilterValues } from '../../components/ListFilterBar';
import { useAsync, type AsyncState } from '../../hooks/useAsync';
import { errorMessage } from '../../services/http';
import type { ResourceApi } from '../../services/resources';
import { ResourceEditorModal } from './ResourceEditorModal';
import { applyFilters, type ResourceFilter, type SearchFields } from './utils';
import './ResourcePage.css';

export interface ResourcePageProps<Dto extends { readonly id: number }, Input, Values extends object> {
  readonly title: string;
  readonly api: ResourceApi<Dto, Input>;
  readonly columns: ColumnsType<Dto>;
  readonly fitTableToPage?: boolean;
  readonly actionsWidth?: number;
  readonly tableMinWidth?: number;
  /** 表单字段；editing 为 null 表示新建 */
  readonly fields: (editing: Dto | null) => ReactNode;
  readonly defaults: Partial<Values>;
  readonly toValues: (dto: Dto) => Partial<Values>;
  readonly toInput: (values: Values) => Input;
  /** 关键字搜索匹配的字段；与 filters 任一提供时显示筛选栏 */
  readonly search?: SearchFields<Dto> | undefined;
  readonly searchPlaceholder?: string | undefined;
  readonly filters?: readonly ResourceFilter<Dto>[] | undefined;
  /** 每行"编辑 / 删除"之外的操作 */
  readonly rowActions?: ((dto: Dto, reload: () => void) => ReactNode) | undefined;
  /** 工具栏"新建"之外的操作 */
  readonly headerExtra?: ((reload: () => void) => ReactNode) | undefined;
}

/** 通用资源管理：列表、筛选、新建、编辑、删除；业务校验以服务端为准，错误直接提示 */
export function ResourcePage<Dto extends { readonly id: number }, Input, Values extends object>(props: ResourcePageProps<Dto, Input, Values>) {
  const list = useAsync(props.api.list, []);
  return <ResourceList {...props} list={list} />;
}

interface ResourceListProps<Dto extends { readonly id: number }, Input, Values extends object> extends ResourcePageProps<Dto, Input, Values> {
  readonly list: AsyncState<Dto[]> & { readonly reload: () => void };
  readonly onOpenRow?: (dto: Dto) => void;
  readonly creation?: { readonly open: boolean; readonly change: (open: boolean) => void; readonly label: string };
  readonly onCreated?: (dto: Dto) => void;
  readonly filterState?: { readonly value: FilterValues; readonly change: (next: FilterValues) => void };
}

export function ResourceList<Dto extends { readonly id: number }, Input, Values extends object>(props: ResourceListProps<Dto, Input, Values>) {
  const { message } = App.useApp();
  const { list, creation } = props;
  const [editor, setEditor] = useState<Dto | 'new' | null>(null);
  const editing = editor && editor !== 'new' ? editor : null;
  const open = editor !== null || !!creation?.open;
  const [saving, setSaving] = useState(false);
  const [localFilters, setLocalFilters] = useState<FilterValues>({});
  const filterValues = props.filterState?.value ?? localFilters;

  const rows = list.status === 'ready' ? list.data : [];
  const filters = props.filters ?? [];
  const visible = applyFilters(rows, filters, filterValues, props.search);

  const openForm = (dto: Dto | null) => {
    if (dto === null && creation) creation.change(true);
    else setEditor(dto ?? 'new');
  };
  const closeForm = () => {
    setEditor(null);
    if (creation?.open) creation.change(false);
  };

  const save = async (values: Values) => {
    setSaving(true);
    try {
      const input = props.toInput(values);
      const saved = editing ? await props.api.update(editing.id, input) : await props.api.create(input);
      message.success('已保存');
      closeForm();
      list.reload();
      if (!editing) props.onCreated?.(saved);
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (dto: Dto) => {
    try {
      await props.api.remove(dto.id);
      message.success('已删除');
      list.reload();
    } catch (error) {
      message.error(errorMessage(error));
    }
  };

  const actions: ColumnsType<Dto>[number] = {
    title: '操作',
    key: 'actions',
    width: props.actionsWidth ?? (props.rowActions ? 240 : 140),
    fixed: 'right',
    render: (_, dto) => (
      <Space className="resource-row-actions" size={8}>
        {props.rowActions?.(dto, list.reload)}
        <Button size="small" onClick={() => openForm(dto)}>编辑</Button>
        <Popconfirm title="确定删除？" onConfirm={() => remove(dto)}>
          <Button size="small" danger>删除</Button>
        </Popconfirm>
      </Space>
    ),
  };

  return (
    <section className="resource-list" aria-label={props.title}>
      <Flex wrap align="center" gap={12} style={{ marginBottom: 12 }}>
        {props.search || filters.length ? (
          <ListFilterBar
            value={filterValues}
            onChange={props.filterState?.change ?? setLocalFilters}
            searchPlaceholder={props.searchPlaceholder ?? '搜索'}
            selects={filters.map((filter) => ({ key: filter.key, placeholder: filter.placeholder, options: filter.options(rows) }))}
          />
        ) : null}
        <Space wrap style={{ marginInlineStart: 'auto' }}>
          {props.headerExtra?.(list.reload)}
          <Button type="primary" onClick={() => openForm(null)}>{creation?.label ?? '新建'}</Button>
        </Space>
      </Flex>
      {list.status === 'error' ? <Alert type="error" title={list.message} action={<Button onClick={list.reload}>重试</Button>} /> : null}
      <Table<Dto>
        rowKey="id"
        onRow={(dto) => props.onOpenRow ? {
          style: { cursor: 'pointer' },
          onClick: (event) => {
            const target = event.target;
            if (target instanceof Element && event.currentTarget.contains(target) && !target.closest('button, a')) props.onOpenRow?.(dto);
          },
        } : {}}
        loading={list.status === 'loading'}
        dataSource={visible}
        columns={[...props.columns, actions]}
        {...(props.fitTableToPage ? { tableLayout: 'fixed' as const, scroll: {x: props.tableMinWidth ?? 900} } : { scroll: { x: 'max-content' } })}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
      />
      {open && (
        <ResourceEditorModal<Values> key={editing?.id ?? 'new'} title={`${editing ? '编辑' : '新建'}${props.title}`}
          initialValues={editing ? props.toValues(editing) : props.defaults}
          saving={saving} onSave={save} onCancel={closeForm}>
          {props.fields(editing)}
        </ResourceEditorModal>
      )}
    </section>
  );
}
