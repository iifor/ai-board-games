import { VOICE_PROVIDERS, type VoiceDto, type VoiceInput, type VoiceProvider } from '@battle/shared';
import { Form, Input, Select, Switch, Tag } from 'antd';
import { voicesApi } from '../../services/resources';
import { ResourcePage } from './ResourcePage';

interface Values {
  name: string;
  provider: VoiceProvider;
  voiceName: string;
  enabled: boolean;
}

const PROVIDER_LABELS: Readonly<Record<VoiceProvider, string>> = { azure: 'Azure 语音', mimo: 'Mimo', browser: '浏览器朗读' };

export function VoicesPage() {
  return (
    <ResourcePage<VoiceDto, VoiceInput, Values>
      title="音色"
      api={voicesApi}
      columns={[
        { title: '名称', dataIndex: 'name' },
        { title: '来源', dataIndex: 'provider', render: (provider: VoiceProvider) => PROVIDER_LABELS[provider] },
        { title: '音色名', dataIndex: 'voiceName' },
        { title: '状态', dataIndex: 'enabled', render: (enabled: boolean) => (enabled ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>) },
      ]}
      defaults={{ provider: 'azure', enabled: true }}
      toValues={(dto) => dto}
      toInput={(values) => values}
      fields={() => (
        <>
          <Form.Item name="name" label="名称" extra="名为「主持人」的音色用于主持播报" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="provider" label="来源" rules={[{ required: true }]}>
            <Select options={VOICE_PROVIDERS.map((value) => ({ value, label: PROVIDER_LABELS[value] }))} />
          </Form.Item>
          <Form.Item name="voiceName" label="音色名" rules={[{ required: true }]}><Input placeholder="zh-CN-XiaoxiaoNeural" /></Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item>
        </>
      )}
    />
  );
}
