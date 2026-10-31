import { Alert, App, Button, Form, Modal, Popconfirm, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState, type ReactNode } from 'react';
import { useAsync } from '../../hooks/useAsync';
import { errorMessage } from '../../services/http';
import type { ResourceApi } from '../../services/resources';

export interface ResourcePageProps<Dto extends { readonly id: number }, Input, Values extends object> {
  readonly title: string;
  readonly api: ResourceApi<Dto, Input>;
  readonly columns: ColumnsType<Dto>;
  /** 表单字段；editing 为 null 表示新建 */
  readonly fields: (editing: Dto | null) => ReactNode;
  readonly defaults: Partial<Values>;
  readonly toValues: (dto: Dto) => Partial<Values>;
  readonly toInput: (values: Values) => Input;
}

/** 通用资源管理：列表、新建、编辑、删除；业务校验以服务端为准，错误直接提示 */
export function ResourcePage<Dto extends { readonly id: number }, Input, Values extends object>(props: ResourcePageProps<Dto, Input, Values>) {
  const { message } = App.useApp();
  const list = useAsync(props.api.list, []);
  const [form] = Form.useForm<Values>();
  const [editing, setEditing] = useState<Dto | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

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
    width: 140,
    render: (_, dto) => (
      <Space>
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
        <Button type="primary" onClick={() => openForm(null)}>新建</Button>
      </Space>
      {list.status === 'error' ? <Alert type="error" title={list.message} action={<Button onClick={list.reload}>重试</Button>} /> : null}
      <Table<Dto>
        rowKey="id"
        loading={list.status === 'loading'}
        dataSource={list.status === 'ready' ? list.data : []}
        columns={[...props.columns, actions]}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
      />
      <Modal title={editing ? `编辑${props.title}` : `新建${props.title}`} open={open} onOk={save} confirmLoading={saving} onCancel={() => setOpen(false)} destroyOnHidden>
        <Form form={form} layout="vertical">{props.fields(editing)}</Form>
      </Modal>
    </section>
  );
}
