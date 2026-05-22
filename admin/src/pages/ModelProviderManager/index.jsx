import React, { useEffect, useState } from 'react';
import { App as AntApp, Button, Card, Form, Input, Modal, Select, Space, Switch, Table, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { adminRequest } from '../../services/adminApi';
import { API_FORMAT_OPTIONS } from '../../constants/adminConstants';
import { booleanOptions, filterByQuery, formatApiFormat } from '../../utils/adminHelpers';
import { EntityModal } from '../../components/shared/EntityModal';
import { ListFilterBar } from '../../components/shared/ListFilterBar';
import { TableActions } from '../../components/shared/TableActions';

export function ModelProviderManager() {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const [providers, setProviders] = useState([]);
  const [editing, setEditing] = useState(null);
  const [filters, setFilters] = useState({});

  useEffect(() => {
    refresh();
  }, []);

  const filteredProviders = filterByQuery(
    providers
      .filter((provider) => !filters.apiFormat || provider.apiFormat === filters.apiFormat)
      .filter((provider) => filters.enabled === undefined || provider.enabled === filters.enabled),
    filters.q,
    ['name', 'baseUrl', 'apiKey', (provider) => formatApiFormat(provider.apiFormat)]
  );

  async function refresh() {
    try {
      setProviders(await adminRequest('/model-providers'));
    } catch (error) {
      message.error(error.message);
    }
  }

  async function save(values) {
    const path = editing?.id ? `/model-providers/${editing.id}` : '/model-providers';
    const method = editing?.id ? 'PUT' : 'POST';
    try {
      await adminRequest(path, { method, body: JSON.stringify(values) });
      message.success('供应商已保存');
      setEditing(null);
      await refresh();
    } catch (error) {
      message.error(error.message);
    }
  }

  function confirmRemove(provider) {
    Modal.confirm({
      title: '删除供应商',
      content: `确认删除“${provider.name}”吗？供应商下仍有模型时不能删除。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      async onOk() {
        try {
          await adminRequest(`/model-providers/${provider.id}`, { method: 'DELETE' });
          message.success('供应商已删除');
          await refresh();
        } catch (error) {
          message.error(error.message);
        }
      }
    });
  }

  return (
    <>
      <Card title="供应商列表" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({})}>新增供应商</Button>}>
        <ListFilterBar
          value={filters}
          onChange={setFilters}
          searchPlaceholder="搜索供应商、Base URL、API Key"
          selects={[
            { key: 'apiFormat', placeholder: '接口格式', options: API_FORMAT_OPTIONS },
            { key: 'enabled', placeholder: '状态', options: booleanOptions() }
          ]}
        />
        <Table rowKey="id" dataSource={filteredProviders} columns={[
          { title: '供应商名称', dataIndex: 'name' },
          { title: 'Base URL', dataIndex: 'baseUrl', ellipsis: true },
          { title: 'API Key', dataIndex: 'apiKey', ellipsis: true, render: (value) => value || '-' },
          { title: '接口格式', dataIndex: 'apiFormat', render: formatApiFormat },
          { title: '模型数', dataIndex: 'modelCount', width: 90 },
          { title: '启用', dataIndex: 'enabled', width: 90, render: (value) => <Tag color={value ? 'green' : 'default'}>{value ? '启用' : '停用'}</Tag> },
          {
            title: '操作',
            width: 260,
            render: (_, provider) => (
              <Space>
                <Button size="small" onClick={() => navigate(`/models/providers/${provider.id}`)}>模型列表</Button>
                <TableActions onEdit={() => setEditing(provider)} onDelete={() => confirmRemove(provider)} />
              </Space>
            )
          }
        ]} />
      </Card>
      <ProviderModal open={editing !== null} initialValues={editing} onCancel={() => setEditing(null)} onSave={save} />
    </>
  );
}

function ProviderModal({ open, initialValues, onCancel, onSave }) {
  const apiFormat = initialValues?.apiFormat === 'anthropic-compatible' ? 'anthropic-compatible' : 'openai-compatible';
  return (
    <EntityModal open={open} title={initialValues?.id ? '编辑供应商' : '新增供应商'} initialValues={{ apiFormat, enabled: true, ...(initialValues || {}) }} onCancel={onCancel} onSave={onSave}>
      <Form.Item name="name" label="供应商名称" rules={[{ required: true, message: '请输入供应商名称' }]}><Input /></Form.Item>
      <Form.Item name="baseUrl" label="Base URL"><Input /></Form.Item>
      <Form.Item name="apiKey" label="API Key"><Input autoComplete="new-password" /></Form.Item>
      <Form.Item name="apiFormat" label="接口格式"><Select options={API_FORMAT_OPTIONS} /></Form.Item>
      <Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item>
    </EntityModal>
  );
}
