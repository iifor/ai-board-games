import React, { useEffect, useState } from 'react';
import { App as AntApp, Button, Card, Descriptions, Form, Input, Modal, Space, Table } from 'antd';
import { ApiOutlined, PlusOutlined } from '@ant-design/icons';
import { Switch } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { adminRequest } from '../../services/adminApi';
import { filterByQuery, formatApiFormat } from '../../utils/adminHelpers';
import { EntityModal } from '../../components/shared/EntityModal';
import { TableActions } from '../../components/shared/TableActions';
import { ListFilterBar } from '../../components/shared/ListFilterBar';

export function ModelManager() {
  const { message } = AntApp.useApp();
  const navigate = useNavigate();
  const { providerId } = useParams();
  const [provider, setProvider] = useState(null);
  const [models, setModels] = useState([]);
  const [editing, setEditing] = useState(null);
  const [testingId, setTestingId] = useState(null);
  const [filters, setFilters] = useState({});

  useEffect(() => {
    refresh();
  }, [providerId]);

  const filteredModels = filterByQuery(models, filters.q, ['name']);

  async function refresh() {
    try {
      const [providerDetail, providerModels] = await Promise.all([
        adminRequest(`/model-providers/${providerId}`),
        adminRequest(`/model-providers/${providerId}/models`)
      ]);
      setProvider(providerDetail);
      setModels(providerModels);
    } catch (error) {
      message.error(error.message);
    }
  }

  async function save(values) {
    const path = editing?.id ? `/models/${editing.id}` : `/model-providers/${providerId}/models`;
    const method = editing?.id ? 'PUT' : 'POST';
    try {
      await adminRequest(path, { method, body: JSON.stringify(values) });
      message.success('模型已保存');
      setEditing(null);
      await refresh();
    } catch (error) {
      message.error(error.message);
    }
  }

  function confirmRemove(model) {
    Modal.confirm({
      title: '删除模型',
      content: `确认删除“${model.name}”吗？绑定该模型的玩家会解除模型绑定。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      async onOk() {
        await adminRequest(`/models/${model.id}`, { method: 'DELETE' });
        message.success('模型已删除');
        await refresh();
      }
    });
  }

  async function testModel(model) {
    setTestingId(model.id);
    try {
      const result = await adminRequest(`/models/${model.id}/test`, { method: 'POST', body: JSON.stringify({}) });
      if (result.ok) message.success(`连接成功：${result.latencyMs || 0}ms，${result.message || '模型可用'}`);
      else message.error(`连接失败：${result.message}`);
    } catch (error) {
      message.error(error.message);
    } finally {
      setTestingId(null);
    }
  }

  return (
    <>
      <Card
        title={`${provider?.name || '供应商'}模型列表`}
        extra={<Space><Button onClick={() => navigate('/models/providers')}>返回供应商</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({})}>新增模型</Button></Space>}
      >
        {provider && (
          <Descriptions size="small" bordered column={2}>
            <Descriptions.Item label="Base URL">{provider.baseUrl || '-'}</Descriptions.Item>
            <Descriptions.Item label="接口格式">{formatApiFormat(provider.apiFormat)}</Descriptions.Item>
          </Descriptions>
        )}
        <ListFilterBar value={filters} onChange={setFilters} searchPlaceholder="搜索模型名称" />
        <Table rowKey="id" dataSource={filteredModels} columns={[
          { title: '模型名称', dataIndex: 'name' },
          {
            title: '操作',
            width: 240,
            render: (_, model) => (
              <Space>
                <Button size="small" icon={<ApiOutlined />} loading={testingId === model.id} onClick={() => testModel(model)}>测试</Button>
                <TableActions onEdit={() => setEditing(model)} onDelete={() => confirmRemove(model)} />
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
  return (
    <EntityModal open={open} title={initialValues?.id ? '编辑模型' : '新增模型'} initialValues={initialValues?.id ? initialValues : { thinkingEnabled: false }} onCancel={onCancel} onSave={onSave}>
      <Form.Item name="name" label="模型名称" rules={[{ required: true, message: '请输入模型名称' }]}><Input /></Form.Item>
      <Form.Item name="thinkingEnabled" label="Think 模式" valuePropName="checked">
        <Switch checkedChildren="开" unCheckedChildren="关" />
      </Form.Item>
    </EntityModal>
  );
}
