import type { ProviderDto, ProviderInput } from '@battle/shared';
import { Button, Form, Input, Switch } from 'antd';
import { useNavigate } from 'react-router';
import { providersApi } from '../../services/resources';
import { ResourcePage } from './ResourcePage';
import { StatusTag } from './StatusTag';
import { enabledFilter } from './utils';

interface Values {
  name: string;
  baseUrl: string;
  apiKey?: string;
  enabled: boolean;
}

export function ProvidersPage() {
  const navigate = useNavigate();
  return (
    <ResourcePage<ProviderDto, ProviderInput, Values>
      title="模型供应商"
      api={providersApi}
      searchPlaceholder="搜索名称或 Base URL"
      search={(dto) => [dto.name, dto.baseUrl]}
      filters={[enabledFilter<ProviderDto>()]}
      rowActions={(dto) => <Button size="small" onClick={() => navigate(`/models?providerId=${dto.id}`)}>模型列表</Button>}
      columns={[
        { title: '名称', dataIndex: 'name' },
        { title: 'Base URL', dataIndex: 'baseUrl', ellipsis: true },
        { title: 'API Key', dataIndex: 'apiKeyMasked', width: 110 },
        { title: '模型数', dataIndex: 'modelCount', width: 80 },
        { title: '状态', dataIndex: 'enabled', width: 80, render: (enabled: boolean) => <StatusTag enabled={enabled} /> },
      ]}
      defaults={{ enabled: true }}
      toValues={(dto) => ({ name: dto.name, baseUrl: dto.baseUrl, enabled: dto.enabled })}
      toInput={(values) => ({ name: values.name, baseUrl: values.baseUrl, enabled: values.enabled, ...(values.apiKey ? { apiKey: values.apiKey } : {}) })}
      fields={(editing) => (
        <>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="baseUrl" label="Base URL（OpenAI 兼容）" rules={[{ required: true, type: 'url' }]}><Input placeholder="https://api.example.com/v1" /></Form.Item>
          <Form.Item name="apiKey" label={editing ? 'API Key（留空表示不修改）' : 'API Key'} rules={[{ required: !editing }]}>
            <Input.Password autoComplete="off" />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item>
        </>
      )}
    />
  );
}
