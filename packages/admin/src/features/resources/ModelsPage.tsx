import type { ModelDto, ModelInput } from '@battle/shared';
import { Form, Input, InputNumber, Select, Switch, Tag } from 'antd';
import { useAsync } from '../../hooks/useAsync';
import { modelsApi, providersApi } from '../../services/resources';
import { ResourcePage } from './ResourcePage';

interface Values {
  providerId: number;
  name: string;
  model: string;
  temperature: number;
  maxTokens: number;
  fallbackModelId: number | null;
  enabled: boolean;
}

export function ModelsPage() {
  const providers = useAsync(providersApi.list, []);
  const models = useAsync(modelsApi.list, []);
  const providerName = (id: number) => (providers.status === 'ready' ? providers.data.find((item) => item.id === id)?.name : null) ?? `#${id}`;
  const modelName = (id: number | null) => (id === null ? '—' : (models.status === 'ready' ? models.data.find((item) => item.id === id)?.name : null) ?? `#${id}`);

  return (
    <ResourcePage<ModelDto, ModelInput, Values>
      title="模型"
      api={modelsApi}
      columns={[
        { title: '名称', dataIndex: 'name' },
        { title: '供应商', dataIndex: 'providerId', render: providerName },
        { title: '模型 ID', dataIndex: 'model' },
        { title: '温度', dataIndex: 'temperature' },
        { title: '最大 tokens', dataIndex: 'maxTokens' },
        { title: '备用模型', dataIndex: 'fallbackModelId', render: modelName },
        { title: '状态', dataIndex: 'enabled', render: (enabled: boolean) => (enabled ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>) },
      ]}
      defaults={{ temperature: 0.7, maxTokens: 1024, fallbackModelId: null, enabled: true }}
      toValues={(dto) => dto}
      toInput={(values) => values}
      fields={(editing) => (
        <>
          <Form.Item name="providerId" label="供应商" rules={[{ required: true }]}>
            <Select options={providers.status === 'ready' ? providers.data.map((item) => ({ value: item.id, label: item.name })) : []} />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="model" label="模型 ID" rules={[{ required: true }]}><Input placeholder="gpt-4o-mini" /></Form.Item>
          <Form.Item name="temperature" label="温度" rules={[{ required: true }]}><InputNumber min={0} max={2} step={0.1} /></Form.Item>
          <Form.Item name="maxTokens" label="最大 tokens" rules={[{ required: true }]}><InputNumber min={16} max={32000} /></Form.Item>
          <Form.Item name="fallbackModelId" label="备用模型（主模型多次失败后切换）">
            <Select
              allowClear
              options={models.status === 'ready' ? models.data.filter((item) => item.id !== editing?.id).map((item) => ({ value: item.id, label: item.name })) : []}
            />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item>
        </>
      )}
    />
  );
}
