import { DEFAULT_MODEL_MAX_TOKENS, type ModelDto, type ModelInput, type ProviderDto } from '@battle/shared';
import { Button, Form, Input, InputNumber, Select, Space, Switch, Tag, Typography } from 'antd';
import type { FilterValues } from '../../components/ListFilterBar';
import { useAsync } from '../../hooks/useAsync';
import { modelsApi } from '../../services/resources';
import { formatTime } from '../../utils/format';
import { ModelActions } from './ModelActions';
import { ResourceList } from './ResourcePage';
import { StatusTag } from './StatusTag';
import { enabledFilter } from './utils';

interface Values {
  name: string;
  model: string;
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

interface Props {
  readonly provider: ProviderDto;
  readonly revision: number;
  readonly onCatalog: () => void;
  readonly filters: FilterValues;
  readonly onFilter: (values: FilterValues) => void;
  readonly creating: boolean;
  readonly onCreateChange: (open: boolean) => void;
  readonly onModelsChanged: () => void;
}

export function ModelsPage({ provider, revision, onCatalog, filters, onFilter, creating, onCreateChange, onModelsChanged }: Props) {
  const models = useAsync(modelsApi.list, [revision]);
  const reload = () => { models.reload(); onModelsChanged(); };
  const list = models.status === 'ready'
    ? { ...models, data: models.data.filter(item => item.providerId === provider.id), reload }
    : {...models, reload};
  const modelName = (id: number | null) => (id === null ? '—' : (models.status === 'ready' ? models.data.find((item) => item.id === id)?.name : null) ?? `#${id}`);

  return (
    <ResourceList<ModelDto, ModelInput, Values>
      title="模型"
      list={list}
      fitTableToPage
      actionsWidth={list.status === 'ready' && list.data.some(m => m.disabledReason === 'quota_exhausted') ? 300 : 224}
      tableMinWidth={0}
      creation={{ open: creating, change: onCreateChange, label: '添加模型' }}
      api={modelsApi}
      searchPlaceholder="搜索名称或模型 ID"
      search={(dto) => [dto.name, dto.model]}
      filters={[enabledFilter<ModelDto>()]}
      filterState={{ value: filters, change: onFilter }}
      headerExtra={() => <Button disabled={!provider.enabled} onClick={onCatalog}>拉取模型</Button>}
      rowActions={(dto, reload) => <ModelActions model={dto} reload={reload} />}
      columns={[
        { title: '模型', key: 'model', render: (_, dto) => (
          <div className="model-resource-info">
            <span className="resource-ellipsis" title={dto.name}>{dto.name}</span>
            <small className="resource-ellipsis" title={dto.model}>{dto.model}</small>
            <small className="model-compact-detail">模型输出上限 {dto.maxTokens} tokens</small>
            <small className="model-fallback-detail">备用模型 · {modelName(dto.fallbackModelId)}</small>
            <div className="model-compact-detail">{statusOf(dto)}</div>
          </div>
        ) },
        { title: '输出上限', dataIndex: 'maxTokens', width: 110, render: (value:number) => <span title="tokens">{value}</span> },
        { title: '备用模型', dataIndex: 'fallbackModelId', width: 130, responsive: ['xxl'], ellipsis: true, render: modelName },
        { title: '状态', key: 'status', width: 114, responsive: ['lg'], render: (_, dto) => statusOf(dto) },
      ]}
      defaults={{ maxTokens: DEFAULT_MODEL_MAX_TOKENS, fallbackModelId: null, enabled: true }}
      toValues={(dto) => dto}
      toInput={(values) => ({ ...values, providerId: provider.id })}
      fields={(editing) => (
        <>
          <Form.Item name="name" label="名称" extra="后台展示用，可与模型 ID 不同" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="model" label="模型 ID" extra="调用接口时发送的模型标识" rules={[{ required: true }]}><Input placeholder="gpt-4o-mini" /></Form.Item>
          <Form.Item name="maxTokens" label="模型输出上限（tokens）" rules={[{ required: true }]}><InputNumber min={16} max={32000} /></Form.Item>
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
