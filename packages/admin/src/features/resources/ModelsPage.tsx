import type { ModelDto, ModelInput } from '@battle/shared';
import { Form, Input, InputNumber, Select, Space, Switch, Tag, Typography } from 'antd';
import { useSearchParams } from 'react-router';
import { useAsync } from '../../hooks/useAsync';
import { modelsApi, providersApi } from '../../services/resources';
import { formatTime } from '../../utils/format';
import { ModelActions } from './ModelActions';
import { ResourcePage } from './ResourcePage';
import { StatusTag } from './StatusTag';
import { enabledFilter, type ResourceFilter } from './utils';

interface Values {
  providerId: number;
  name: string;
  model: string;
  temperature: number;
  maxTokens: number;
  fallbackModelId: number | null;
  enabled: boolean;
}

function statusOf(model: ModelDto) {
  if (model.disabledReason === 'quota_exhausted') {
    return (
      <Space direction="vertical" size={0}>
        <Tag color="error">额度已用完</Tag>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{formatTime(model.disabledAt)}</Typography.Text>
      </Space>
    );
  }
  return <StatusTag enabled={model.enabled} />;
}

export function ModelsPage() {
  const [params] = useSearchParams();
  const providers = useAsync(providersApi.list, []);
  const models = useAsync(modelsApi.list, []);
  const providerName = (id: number) => (providers.status === 'ready' ? providers.data.find((item) => item.id === id)?.name : null) ?? `#${id}`;
  const modelName = (id: number | null) => (id === null ? '—' : (models.status === 'ready' ? models.data.find((item) => item.id === id)?.name : null) ?? `#${id}`);
  const providerFilter: ResourceFilter<ModelDto> = {
    key: 'providerId',
    placeholder: '供应商',
    options: () => (providers.status === 'ready' ? providers.data.map((item) => ({ value: String(item.id), label: item.name })) : []),
    matches: (dto, value) => String(dto.providerId) === value,
  };

  return (
    <ResourcePage<ModelDto, ModelInput, Values>
      title="模型"
      api={modelsApi}
      searchPlaceholder="搜索名称或模型 ID"
      search={(dto) => [dto.name, dto.model]}
      filters={[providerFilter, enabledFilter<ModelDto>()]}
      initialFilters={{ providerId: params.get('providerId') ?? undefined }}
      rowActions={(dto, reload) => <ModelActions model={dto} reload={() => { reload(); models.reload(); }} />}
      columns={[
        { title: '名称', dataIndex: 'name' },
        { title: '供应商', dataIndex: 'providerId', render: providerName },
        { title: '模型 ID', dataIndex: 'model' },
        { title: '温度', dataIndex: 'temperature', width: 70 },
        { title: '最大 tokens', dataIndex: 'maxTokens', width: 100 },
        { title: '备用模型', dataIndex: 'fallbackModelId', render: modelName },
        { title: '状态', key: 'status', render: (_, dto) => statusOf(dto) },
      ]}
      defaults={{ temperature: 0.7, maxTokens: 1024, fallbackModelId: null, enabled: true }}
      toValues={(dto) => dto}
      toInput={(values) => values}
      fields={(editing) => (
        <>
          <Form.Item name="providerId" label="供应商" rules={[{ required: true }]}>
            <Select options={providers.status === 'ready' ? providers.data.map((item) => ({ value: item.id, label: item.name })) : []} />
          </Form.Item>
          <Form.Item name="name" label="名称" extra="后台展示用，可与模型 ID 不同" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="model" label="模型 ID" extra="调用接口时发送的模型标识" rules={[{ required: true }]}><Input placeholder="gpt-4o-mini" /></Form.Item>
          <Form.Item name="temperature" label="温度" rules={[{ required: true }]}><InputNumber min={0} max={2} step={0.1} /></Form.Item>
          <Form.Item name="maxTokens" label="最大 tokens" rules={[{ required: true }]}><InputNumber min={16} max={32000} /></Form.Item>
          <Form.Item name="fallbackModelId" label="备用模型（主模型多次失败或额度耗尽后切换）">
            <Select
              allowClear
              options={models.status === 'ready' ? models.data.filter((item) => item.id !== editing?.id).map((item) => ({ value: item.id, label: item.name })) : []}
            />
          </Form.Item>
          <Form.Item name="enabled" label="启用" extra={editing?.disabledReason ? '该模型因额度耗尽被自动停用，确认额度恢复后再启用' : undefined} valuePropName="checked"><Switch /></Form.Item>
        </>
      )}
    />
  );
}
