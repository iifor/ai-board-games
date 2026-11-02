import type { PlayerDto, PlayerInput } from '@battle/shared';
import { Avatar, Form, Input, Select, Switch } from 'antd';
import { useAsync } from '../../hooks/useAsync';
import { modelsApi, playersApi, voicesApi } from '../../services/resources';
import { ResourcePage } from './ResourcePage';
import { StatusTag } from './StatusTag';

interface Values {
  name: string;
  avatar: string | null;
  persona: string;
  modelId: number;
  voiceId: number | null;
  enabled: boolean;
}

export function PlayersPage() {
  const models = useAsync(modelsApi.list, []);
  const voices = useAsync(voicesApi.list, []);
  const modelList = models.status === 'ready' ? models.data : [];
  const voiceList = voices.status === 'ready' ? voices.data : [];
  const name = (list: readonly { id: number; name: string }[], id: number | null) =>
    id === null ? '—' : list.find((item) => item.id === id)?.name ?? `#${id}`;

  return (
    <ResourcePage<PlayerDto, PlayerInput, Values>
      title="AI 玩家"
      api={playersApi}
      columns={[
        { title: '', dataIndex: 'avatar', width: 56, render: (avatar: string | null, dto) => <Avatar src={avatar ?? undefined}>{dto.name.slice(0, 1)}</Avatar> },
        { title: '名字', dataIndex: 'name' },
        { title: '人设', dataIndex: 'persona', ellipsis: true },
        { title: '模型', dataIndex: 'modelId', render: (id: number) => name(modelList, id) },
        { title: '音色', dataIndex: 'voiceId', render: (id: number | null) => name(voiceList, id) },
        { title: '状态', dataIndex: 'enabled', render: (enabled: boolean) => <StatusTag enabled={enabled} /> },
      ]}
      defaults={{ persona: '', voiceId: null, avatar: null, enabled: true }}
      toValues={(dto) => dto}
      toInput={(values) => ({ ...values, avatar: values.avatar || null })}
      fields={() => (
        <>
          <Form.Item name="name" label="名字" rules={[{ required: true, max: 32 }]}><Input /></Form.Item>
          <Form.Item name="avatar" label="头像 URL" rules={[{ type: 'url' }]}><Input placeholder="https://…" /></Form.Item>
          <Form.Item name="persona" label="人设（会写进该玩家的提示词）" rules={[{ max: 500 }]}><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="modelId" label="模型" rules={[{ required: true }]}>
            <Select options={modelList.map((item) => ({ value: item.id, label: item.name }))} />
          </Form.Item>
          <Form.Item name="voiceId" label="音色">
            <Select allowClear options={voiceList.map((item) => ({ value: item.id, label: item.name }))} />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item>
        </>
      )}
    />
  );
}
