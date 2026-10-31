import type { ProviderDto, ProviderInput } from '@battle/shared';
import { Form, Input, Switch, Tag } from 'antd';
import { providersApi } from '../../services/resources';
import { ResourcePage } from './ResourcePage';

interface Values {
  name: string;
  baseUrl: string;
  apiKey?: string;
  enabled: boolean;
}

export function ProvidersPage() {
  return (
    <ResourcePage<ProviderDto, ProviderInput, Values>
      title="模型供应商"
      api={providersApi}
      columns={[
        { title: '名称', dataIndex: 'name' },
        { title: 'Base URL', dataIndex: 'baseUrl' },
        { title: 'API Key', dataIndex: 'apiKeyMasked' },
        { title: '状态', dataIndex: 'enabled', render: (enabled: boolean) => (enabled ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>) },
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
