import type { ProviderDto, ProviderInput } from '@battle/shared';
import { Button, Form, Input, Space, Switch, Typography } from 'antd';
import { useState } from 'react';
import { Link } from 'react-router';
import type { AsyncState } from '../../hooks/useAsync';
import { providersApi } from '../../services/resources';
import { ResourceList } from './ResourcePage';
import { StatusTag } from './StatusTag';
import { enabledFilter } from './utils';

interface Values {
  name: string;
  baseUrl: string;
  apiKey?: string;
  enabled: boolean;
}

interface Props {
  readonly list: AsyncState<ProviderDto[]> & { readonly reload: () => void };
  readonly creating: boolean;
  readonly onCreateChange: (open: boolean) => void;
  readonly onCreated: (provider: ProviderDto) => void;
  readonly showModels: (id: number) => void;
}

function ProviderKeyField({ provider }: { readonly provider: ProviderDto | null }) {
  const [replacing, setReplacing] = useState(false);
  if (provider && !replacing) {
    return (
      <Form.Item label="API Key">
        <Space>
          <Typography.Text code>{provider.apiKeyMasked}</Typography.Text>
          <Button type="link" onClick={() => setReplacing(true)}>更换 API Key</Button>
        </Space>
      </Form.Item>
    );
  }
  return (
    <Form.Item name="apiKey" label={provider ? '新 API Key（留空保留原密钥）' : 'API Key'} rules={[{ required: !provider }]}>
      <Input.Password autoComplete="new-password" />
    </Form.Item>
  );
}

export function ProvidersPage({ list, creating, onCreateChange, onCreated, showModels }: Props) {
  return (
    <ResourceList<ProviderDto, ProviderInput, Values>
      title="模型供应商"
      list={list}
      fitTableToPage
      creation={{ open: creating, change: onCreateChange, label: '添加供应商' }}
      onCreated={onCreated}
      api={providersApi}
      searchPlaceholder="搜索名称或 Base URL"
      search={(dto) => [dto.name, dto.baseUrl]}
      filters={[enabledFilter<ProviderDto>()]}
      onOpenRow={dto => showModels(dto.id)}
      columns={[
        { title: '供应商', key: 'provider', render: (_, dto) => (
          <div className="model-resource-info">
            <Link to={`/models/${dto.id}`} onClick={event => {
              if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              showModels(dto.id);
            }}>{dto.name}</Link>
            <small>{dto.baseUrl}</small>
            <small className="model-compact-detail">API Key · {dto.apiKeyMasked}</small>
            <span className="model-compact-detail">{dto.modelCount} 个模型 · <StatusTag enabled={dto.enabled} /></span>
          </div>
        ) },
        { title: 'API Key', dataIndex: 'apiKeyMasked', width: 128, responsive: ['lg'] },
        { title: '模型数', dataIndex: 'modelCount', width: 80, responsive: ['lg'] },
        { title: '状态', dataIndex: 'enabled', width: 80, responsive: ['lg'], render: (enabled: boolean) => <StatusTag enabled={enabled} /> },
      ]}
      defaults={{ enabled: true }}
      toValues={(dto) => ({ name: dto.name, baseUrl: dto.baseUrl, enabled: dto.enabled })}
      toInput={(values) => ({ name: values.name, baseUrl: values.baseUrl, enabled: values.enabled, ...(values.apiKey ? { apiKey: values.apiKey } : {}) })}
      fields={(editing) => (
        <>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="baseUrl" label="Base URL（OpenAI 兼容）" rules={[{ required: true, type: 'url' }]}><Input type="url" autoComplete="url" placeholder="https://api.example.com/v1" /></Form.Item>
          <ProviderKeyField provider={editing} />
          <Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item>
        </>
      )}
    />
  );
}
