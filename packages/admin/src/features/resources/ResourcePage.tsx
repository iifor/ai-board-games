import { Alert, App, Button, Form, Modal, Popconfirm, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState, type ReactNode } from 'react';
import { ListFilterBar, type FilterValues } from '../../components/ListFilterBar';
import { useAsync } from '../../hooks/useAsync';
import { errorMessage } from '../../services/http';
import type { ResourceApi } from '../../services/resources';
import { applyFilters, type ResourceFilter, type SearchFields } from './utils';

export interface ResourcePageProps<Dto extends { readonly id: number }, Input, Values extends object> {
  readonly title: string;
  readonly api: ResourceApi<Dto, Input>;
  readonly columns: ColumnsType<Dto>;
  /** 表单字段；editing 为 null 表示新建 */
  readonly fields: (editing: Dto | null) => ReactNode;
  readonly defaults: Partial<Values>;
  readonly toValues: (dto: Dto) => Partial<Values>;
  readonly toInput: (values: Values) => Input;
  /** 关键字搜索匹配的字段；与 filters 任一提供时显示筛选栏 */
  readonly search?: SearchFields<Dto> | undefined;
  readonly searchPlaceholder?: string | undefined;
  readonly filters?: readonly ResourceFilter<Dto>[] | undefined;
  readonly initialFilters?: FilterValues | undefined;
  /** 每行"编辑 / 删除"之外的操作 */
  readonly rowActions?: ((dto: Dto, reload: () => void) => ReactNode) | undefined;
  /** 标题栏"新建"之外的操作 */
  readonly headerExtra?: ((reload: () => void) => ReactNode) | undefined;
}

/** 通用资源管理：列表、筛选、新建、编辑、删除；业务校验以服务端为准，错误直接提示 */
export function ResourcePage<Dto extends { readonly id: number }, Input, Values extends object>(props: ResourcePageProps<Dto, Input, Values>) {
  const { message } = App.useApp();
  const list = useAsync(props.api.list, []);
  const [form] = Form.useForm<Values>();
  const [editing, setEditing] = useState<Dto | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterValues, setFilterValues] = useState<FilterValues>(props.initialFilters ?? {});

  const rows = list.status === 'ready' ? list.data : [];
  const filters = props.filters ?? [];
  const visible = applyFilters(rows, filters, filterValues, props.search);

  const openForm = (dto: Dto | null) => {
    setEditing(dto);
    form.resetFields();
    form.setFieldsValue((dto ? props.toValues(dto) : props.defaults) as Parameters<typeof form.setFieldsValue>[0]);
    setOpen(true);
  };

  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const input = props.toInput(values);
      if (editing) await props.api.update(editing.id, input);
      else await props.api.create(input);
      message.success('已保存');
      setOpen(false);
      list.reload();
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
    width: props.rowActions ? 280 : 140,
    render: (_, dto) => (
      <Space>
        {props.rowActions?.(dto, list.reload)}
        <Button size="small" onClick={() => openForm(dto)}>编辑</Button>
        <Popconfirm title="确定删除？" onConfirm={() => remove(dto)}>
          <Button size="small" danger>删除</Button>
        </Popconfirm>
      </Space>
    ),
  };

  return (
    <section>
      <Space style={{ width: '100%', justifyContent: 'space-between', margin: '16px 0' }}>
        <Typography.Title level={3} style={{ margin: 0 }}>{props.title}</Typography.Title>
        <Space>
          {props.headerExtra?.(list.reload)}
          <Button type="primary" onClick={() => openForm(null)}>新建</Button>
        </Space>
      </Space>
      {props.search || filters.length ? (
        <ListFilterBar
          value={filterValues}
          onChange={setFilterValues}
          searchPlaceholder={props.searchPlaceholder ?? '搜索'}
          selects={filters.map((filter) => ({ key: filter.key, placeholder: filter.placeholder, options: filter.options(rows) }))}
        />
      ) : null}
      {list.status === 'error' ? <Alert type="error" title={list.message} action={<Button onClick={list.reload}>重试</Button>} /> : null}
      <Table<Dto>
        rowKey="id"
        loading={list.status === 'loading'}
        dataSource={visible}
        columns={[...props.columns, actions]}
        scroll={{ x: 'max-content' }}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
      />
      <Modal title={editing ? `编辑${props.title}` : `新建${props.title}`} open={open} onOk={save} confirmLoading={saving} onCancel={() => setOpen(false)} destroyOnHidden>
        <Form form={form} layout="vertical">{props.fields(editing)}</Form>
      </Modal>
    </section>
  );
}
