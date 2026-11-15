import { playerSpeechSettings, type PlayerDto, type PlayerInput, type PlayerSpeechOverrides } from '@battle/shared';
import { Avatar, Button, Form, Input, Select, Switch } from 'antd';
import { useState } from 'react';
import { PlayerMemoryDrawer } from '../player-memory/PlayerMemoryDrawer';
import { useAsync } from '../../hooks/useAsync';
import { modelsApi, playersApi, voicesApi } from '../../services/resources';
import { ResourcePage } from './ResourcePage';
import { PlayerSpeechFields } from './PlayerSpeechFields';
import { StatusTag } from './StatusTag';
import { enabledFilter } from './utils';
import { playerLabel } from './playerLabel';

interface Values extends PlayerSpeechOverrides {
  name?: string;
  avatar: string | null;
  persona: string;
  modelId: number | null;
  voiceId: number | null;
  enabled: boolean;
}

export function PlayersPage() {
  const [memory, setMemory] = useState<PlayerDto | null>(null);
  const models = useAsync(modelsApi.list, []);
  const voices = useAsync(voicesApi.list, []);
  const modelList = models.status === 'ready' ? models.data : [];
  const voiceList = voices.status === 'ready' ? voices.data : [];
  const name = (list: readonly { id: number; name: string }[], id: number | null) =>
    id === null ? '—' : list.find((item) => item.id === id)?.name ?? `#${id}`;

  return (
    <><ResourcePage<PlayerDto, PlayerInput, Values>
      title="AI 玩家"
      api={playersApi}
      fitTableToPage
      tableMinWidth={1120}
      actionsWidth={200}
      rowActions={dto => <Button size="small" onClick={() => setMemory(dto)}>记忆</Button>}
      searchPlaceholder="搜索模型、昵称、人设或玩家 ID"
      search={dto => [playerLabel(dto), dto.persona]}
      filters={[enabledFilter<PlayerDto>()]}
      columns={[
        { title: '玩家 / 模型', key: 'player', width: 220, render: (_, dto) => <div className="resource-primary">
          <Avatar src={dto.avatar ?? undefined}>{dto.modelDisplayName?.slice(0, 1) ?? '#'}</Avatar>
          <div className="resource-lines"><span title={dto.modelDisplayName ?? undefined}>{dto.modelDisplayName ?? '未绑定模型'}</span>
            <small>{[dto.name, '#' + dto.id].filter(Boolean).join(' · ')}</small></div>
        </div> },
        { title: '人设', dataIndex: 'persona', render: (value: string) => <div className="resource-full-text">{value}</div> },
        { title: '发言设置', key: 'speech', width: 170, render: (_, dto) => {
          const settings = playerSpeechSettings(dto.persona, dto);
          return <div className="resource-lines"><span>建议 {settings.speechMaxChars} 字 · 温度 {settings.temperature}</span><small>{settings.maxTokens} tokens</small></div>;
        } },
        { title: '音色', dataIndex: 'voiceId', width: 180, ellipsis: true, render: (id: number | null) => name(voiceList, id) },
        { title: '状态', dataIndex: 'enabled', width: 80, render: (enabled: boolean) => <StatusTag enabled={enabled} /> },
      ]}
      defaults={{ persona: '', modelId: null, voiceId: null, avatar: null, enabled: true }}
      toValues={dto => dto}
      toInput={(values) => ({ ...values, name: values.name?.trim() ?? '', modelId: values.modelId ?? null, voiceId: values.voiceId ?? null, avatar: values.avatar || null,
        temperature: values.temperature ?? null, maxTokens: values.maxTokens ?? null, speechMaxChars: values.speechMaxChars ?? null })}
      fields={() => (
        <>
          <Form.Item name="name" label="后台昵称（选填）" rules={[{ max: 32 }]}><Input maxLength={32} /></Form.Item>
          <Form.Item name="avatar" label="头像 URL" rules={[{ type: 'url' }]}><Input placeholder="https://…" /></Form.Item>
          <Form.Item name="persona" label="人设（会写进该玩家的提示词）" rules={[{ max: 500 }]}><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="modelId" label="模型" extra="绑定模型后可参与真实 AI 对局">
            <Select allowClear placeholder="未绑定" options={modelList.map((item) => ({ value: item.id, label: item.name === item.model ? item.model : item.name + ' · ' + item.model }))} />
          </Form.Item>
          <PlayerSpeechFields models={modelList} />
          <Form.Item name="voiceId" label="音色">
            <Select allowClear options={voiceList.map((item) => ({ value: item.id, label: item.name }))} />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item>
        </>
      )}
    />{memory && <PlayerMemoryDrawer key={memory.id} id={memory.id} name={playerLabel(memory)} close={() => setMemory(null)} />}</>
  );
}
