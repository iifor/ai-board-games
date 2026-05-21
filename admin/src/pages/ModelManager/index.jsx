import React, { useEffect, useState } from 'react';
import { App as AntApp, Button, Card, Form, Input, Select, Space, Switch, Table, Tag } from 'antd';
import { ApiOutlined, PlusOutlined } from '@ant-design/icons';
import { adminRequest } from '../../services/adminApi';
import { API_FORMAT_OPTIONS } from '../../constants/adminConstants';
import { filterByQuery, uniqueOptions, booleanOptions, formatApiFormat } from '../../utils/adminHelpers';
import { EntityModal } from '../../components/shared/EntityModal';
import { TableActions } from '../../components/shared/TableActions';
import { ListFilterBar } from '../../components/shared/ListFilterBar';

export function ModelManager() {
  const { message } = AntApp.useApp();
  const [models, setModels] = useState([]);
  const [editing, setEditing] = useState(null);
  const [testingId, setTestingId] = useState(null);
  const [filters, setFilters] = useState({});

  useEffect(() => {
    adminRequest('/models').then(setModels).catch(() => {});
  }, []);

  const filteredModels = filterByQuery(
    models
      .filter((model) => !filters.provider || model.provider === filters.provider)
      .filter((model) => !filters.apiFormat || model.apiFormat === filters.apiFormat)
      .filter((model) => filters.enabled === undefined || model.enabled === filters.enabled),
    filters.q,
    ['provider', 'name', 'baseUrl', (model) => formatApiFormat(model.apiFormat)]
  );

  async function refresh() {
    adminRequest('/models').then(setModels).catch(() => {});
  }

  async function save(values) {
    const path = editing?.id ? `/models/${editing.id}` : '/models';
    const method = editing?.id ? 'PUT' : 'POST';
    await adminRequest(path, { method, body: JSON.stringify(values) });
    message.success('模型已保存');
    setEditing(null);
    await refresh();
  }

  async function remove(id) {
    await adminRequest(`/models/${id}`, { method: 'DELETE' });
    message.success('模型已删除');
    await refresh();
  }

  async function editModel(record) {
    try {
      const detail = await adminRequest(`/models/${record.id}`);
      setEditing(detail);
    } catch (error) {
      message.error(error.message);
    }
  }

  async function testModel(record) {
    setTestingId(record.id);
    try {
      const result = await adminRequest(`/models/${record.id}/test`, { method: 'POST', body: JSON.stringify({}) });
      if (result.ok) message.success(`连接成功：${result.latencyMs || 0}ms，${result.message || '模型可用'}`);
      else message.error(`连接失败：${result.message}`);
    } catch (error) {
      message.error(error.message);
    } finally {
      setTestingId(null);
    }
  }

  const enabledTag = (value) => <Tag color={value ? 'green' : 'default'}>{value ? '启用' : '停用'}</Tag>;

  return (
    <>
      <Card title="模型列表" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({})}>新增模型</Button>}>
        <ListFilterBar
          value={filters}
          onChange={setFilters}
          searchPlaceholder="搜索供应商、模型、Base URL"
          selects={[
            { key: 'provider', placeholder: '供应商', options: uniqueOptions(models.map((model) => model.provider)) },
            { key: 'apiFormat', placeholder: '接口格式', options: API_FORMAT_OPTIONS },
            { key: 'enabled', placeholder: '状态', options: booleanOptions() }
          ]}
        />
        <Table rowKey="id" dataSource={filteredModels} columns={[
          { title: '供应商', dataIndex: 'provider' },
          { title: '模型名称', dataIndex: 'name' },
          { title: 'Base URL', dataIndex: 'baseUrl', ellipsis: true },
          { title: '接口格式', dataIndex: 'apiFormat', render: formatApiFormat },
          { title: 'API Key', dataIndex: 'hasApiKey', render: (value) => <Tag color={value ? 'green' : 'default'}>{value ? '已配置' : '未配置'}</Tag> },
          { title: '启用', dataIndex: 'enabled', render: enabledTag },
          {
            title: '操作',
            width: 240,
            render: (_, record) => (
              <Space>
                <Button size="small" icon={<ApiOutlined />} loading={testingId === record.id} onClick={() => testModel(record)}>测试</Button>
                <TableActions onEdit={() => editModel(record)} onDelete={() => remove(record.id)} />
              </Space>
            )
          }
        ]} />
      </Card>
      <ModelModal open={editing !== null} initialValues={editing} onCancel={() => setEditing(null)} onSave={save} />
    </>
  );
}

function ModelModal({ open, initialValues, onCancel, onSave }) {
  const apiFormat = initialValues?.apiFormat === 'anthropic-compatible' ? 'anthropic-compatible' : 'openai-compatible';
  return (
    <EntityModal open={open} title={initialValues?.id ? '编辑模型' : '新增模型'} initialValues={{ apiFormat, enabled: true, ...initialValues }} onCancel={onCancel} onSave={onSave}>
      <Form.Item name="provider" label="供应商" rules={[{ required: true, message: '请输入供应商' }]}><Input /></Form.Item>
      <Form.Item name="name" label="模型名称" rules={[{ required: true, message: '请输入模型名称' }]}><Input /></Form.Item>
      <Form.Item name="baseUrl" label="Base URL" extra="支持 ${ENV_NAME} 模板变量。Cloudflare Workers AI 示例：https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/v1">
        <Input />
      </Form.Item>
      <Form.Item name="apiKey" label="API Key"><Input autoComplete="new-password" /></Form.Item>
      <Form.Item name="apiFormat" label="接口格式"><Select options={API_FORMAT_OPTIONS} /></Form.Item>
      <Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item>
    </EntityModal>
  );
}
