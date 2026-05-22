import React, { useEffect, useRef, useState } from 'react';
import { App as AntApp, Avatar, Button, Card, Descriptions, Form, Input, Modal, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import { MessageOutlined, PlayCircleOutlined, PlusOutlined, UserOutlined } from '@ant-design/icons';
import { adminRequest } from '../../services/adminApi';
import { emptyPlayer } from '../../constants/adminConstants';
import { filterByQuery, uniqueOptions, booleanOptions, modelName, playVoicePackage } from '../../utils/adminHelpers';
import { EntityModal } from '../../components/shared/EntityModal';
import { AvatarUpload } from '../../components/shared/AvatarUpload';
import { TableActions } from '../../components/shared/TableActions';
import { ListFilterBar } from '../../components/shared/ListFilterBar';

const { Text } = Typography;

export function PlayerManager() {
  const { message } = AntApp.useApp();
  const [players, setPlayers] = useState([]);
  const [models, setModels] = useState([]);
  const [voices, setVoices] = useState([]);
  const [settings, setSettings] = useState({});
  const [editing, setEditing] = useState(null);
  const [debugging, setDebugging] = useState(null);
  const [filters, setFilters] = useState({});

  useEffect(() => {
    Promise.all([
      adminRequest('/players'),
      adminRequest('/models'),
      adminRequest('/voice-packages'),
      adminRequest('/settings')
    ]).then(([p, m, v, s]) => {
      setPlayers(p);
      setModels(m);
      setVoices(v);
      setSettings(s || {});
    }).catch(() => {});
  }, []);

  const modelOptions = models.map((model) => ({
    value: model.id,
    label: `${model.provider}/${model.name}`,
    disabled: !model.enabled
  }));
  const voiceOptions = voices.map((voice) => ({ value: voice.id, label: voice.name }));
  const hostOptions = [
    { value: 0, label: '系统默认主持人' },
    ...players.filter((player) => player.enabled).map((player) => ({ value: Number(player.id), label: `${player.id} · ${player.nickname || player.name}` }))
  ];
  const filteredPlayers = filterByQuery(
    players
      .filter((player) => !filters.sex || player.sex === filters.sex)
      .filter((player) => !filters.modelId || player.modelId === filters.modelId)
      .filter((player) => !filters.voicePackageId || player.voicePackageId === filters.voicePackageId)
      .filter((player) => filters.enabled === undefined || player.enabled === filters.enabled),
    filters.q,
    ['nickname', 'name', 'sex', 'personality', (player) => modelName(player, models), (player) => voices.find((voice) => voice.id === player.voicePackageId)?.name]
  );

  async function refresh() {
    const [p, m, v, s] = await Promise.all([
      adminRequest('/players'),
      adminRequest('/models'),
      adminRequest('/voice-packages'),
      adminRequest('/settings')
    ]);
    setPlayers(p);
    setModels(m);
    setVoices(v);
    setSettings(s || {});
  }

  async function save(values) {
    const payload = { ...values, provider: '', model: '' };
    const path = editing?.id ? `/players/${editing.id}` : '/players';
    const method = editing?.id ? 'PUT' : 'POST';
    try {
      await adminRequest(path, { method, body: JSON.stringify(payload) });
      message.success('玩家已保存');
      setEditing(null);
      await refresh();
    } catch (error) {
      message.error(error.message);
    }
  }

  async function toggle(player) {
    await adminRequest(`/players/${player.id}/enabled`, { method: 'PATCH', body: JSON.stringify({ enabled: !player.enabled }) });
    await refresh();
  }

  async function saveDefaultHost(playerId) {
    await adminRequest('/settings/default-host', { method: 'PUT', body: JSON.stringify({ playerId: Number(playerId) || null }) });
    message.success('默认主持人已更新');
    await refresh();
  }

  function confirmRemove(player) {
    Modal.confirm({
      title: '删除玩家',
      content: `确认删除「${player.nickname || player.name || player.id}」吗？已被历史对局引用的玩家不能删除。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      async onOk() {
        await adminRequest(`/players/${player.id}`, { method: 'DELETE' });
        message.success('玩家已删除');
        await refresh();
      }
    });
  }

  const enabledTag = (value) => <Tag color={value ? 'green' : 'default'}>{value ? '启用' : '停用'}</Tag>;

  return (
    <>
      <Card
        title="玩家列表"
        extra={
          <Space>
            <Text>默认主持人</Text>
            <Select
              style={{ width: 260 }}
              value={Number(settings.defaultHostPlayerId) || 0}
              options={hostOptions}
              onChange={saveDefaultHost}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({})}>新增玩家</Button>
          </Space>
        }
      >
        <ListFilterBar
          value={filters}
          onChange={setFilters}
          searchPlaceholder="搜索昵称、人格、模型、语音包"
          selects={[
            { key: 'sex', placeholder: '性别', options: uniqueOptions(players.map((player) => player.sex)) },
            { key: 'modelId', placeholder: '模型', options: modelOptions },
            { key: 'voicePackageId', placeholder: '语音包', options: voiceOptions },
            { key: 'enabled', placeholder: '状态', options: booleanOptions() }
          ]}
        />
        <Table rowKey="id" dataSource={filteredPlayers} columns={[
          { title: '头像', dataIndex: 'avatar', width: 72, render: (value) => <Avatar src={value} icon={<UserOutlined />} /> },
          { title: '昵称', width: 120, dataIndex: 'nickname' },
          { title: '性别', width: 80, dataIndex: 'sex', render: (value) => value || '-' },
          { title: '模型', width: 250, dataIndex: 'model', render: (_, record) => modelName(record, models) },
          { title: '人格', dataIndex: 'personality', ellipsis: true },
          { title: '语音包', width: 200, dataIndex: 'voicePackageId', render: (value) => voices.find((voice) => voice.id === value)?.name || '-' },
          { title: '状态', width: 100, dataIndex: 'enabled', render: enabledTag },
          {
            title: '操作',
            width: 300,
            render: (_, record) => (
              <Space>
                <Button size="small" icon={<MessageOutlined />} onClick={() => setDebugging(record)}>调试</Button>
                <Button size="small" onClick={() => toggle(record)}>{record.enabled ? '停用' : '启用'}</Button>
                <TableActions onEdit={() => setEditing(record)} onDelete={() => confirmRemove(record)} />
              </Space>
            )
          }
        ]} />
      </Card>
      <PlayerModal open={editing !== null} initialValues={editing} modelOptions={modelOptions} voiceOptions={voiceOptions} onCancel={() => setEditing(null)} onSave={save} />
      <PlayerDebugModal open={Boolean(debugging)} player={debugging} models={models} voices={voices} onCancel={() => setDebugging(null)} />
    </>
  );
}

function PlayerModal({ open, initialValues, modelOptions, voiceOptions, onCancel, onSave }) {
  const selectableModelOptions = modelOptions.filter((option) => !option.disabled || option.value === initialValues?.modelId);
  return (
    <EntityModal open={open} title={initialValues?.id ? '编辑玩家' : '新增玩家'} initialValues={{ ...emptyPlayer, ...(initialValues || {}) }} onCancel={onCancel} onSave={onSave}>
      <Form.Item name="nickname" label="昵称" rules={[{ required: true, message: '请输入昵称' }]}><Input /></Form.Item>
      <Form.Item name="avatar" label="头像"><AvatarUpload /></Form.Item>
      <Form.Item name="sex" label="性别"><Select options={['未知', '男', '女'].map((value) => ({ value, label: value }))} /></Form.Item>
      <Form.Item name="modelId" label="模型"><Select allowClear options={selectableModelOptions} /></Form.Item>
      <Form.Item name="personality" label="人格"><Input.TextArea rows={4} /></Form.Item>
      <Form.Item name="voicePackageId" label="语音包"><Select allowClear options={voiceOptions} /></Form.Item>
      <Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item>
    </EntityModal>
  );
}

function PlayerDebugModal({ open, player, models, voices, onCancel }) {
  const { message } = AntApp.useApp();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [playingKey, setPlayingKey] = useState('');
  const audioRef = useRef(null);

  React.useEffect(() => {
    if (!open) { setInput(''); setMessages([]); setSending(false); setPlayingKey(''); }
  }, [open]);

  if (!player) return null;
  const model = models.find((item) => item.id === player.modelId);
  const voice = voices.find((item) => item.id === player.voicePackageId);

  async function send() {
    const text = input.trim();
    if (!text) return;
    if (!player.modelId) { message.error('该玩家还没有绑定模型'); return; }
    const nextMessages = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    setInput('');
    setSending(true);
    try {
      const result = await adminRequest(`/players/${player.id}/debug-chat`, {
        method: 'POST',
        body: JSON.stringify({ message: text, history: messages })
      });
      setMessages([...nextMessages, { role: 'assistant', content: result.reply || '' }]);
    } catch (error) {
      message.error(error.message);
      setMessages(messages);
    } finally {
      setSending(false);
    }
  }

  async function playReply(item, index) {
    if (!item?.content || !voice) return;
    const key = `assistant-${index}`;
    setPlayingKey(key);
    try {
      await playVoicePackage(voice, item.content, audioRef);
    } catch (error) {
      message.error(error.message);
    } finally {
      setPlayingKey('');
    }
  }

  return (
    <Modal open={open} width={760} title={`调试玩家：${player.nickname || player.name}`} onCancel={onCancel} footer={null} destroyOnHidden>
      <Space direction="vertical" size={12} className="admin-full">
        <Descriptions bordered size="small" column={1}>
          <Descriptions.Item label="昵称">{player.nickname || '-'}</Descriptions.Item>
          <Descriptions.Item label="人格">{player.personality || '-'}</Descriptions.Item>
          <Descriptions.Item label="模型">{model ? `${model.provider}/${model.name}` : '未绑定'}</Descriptions.Item>
          <Descriptions.Item label="语音包">{voice?.name || '未绑定'}</Descriptions.Item>
        </Descriptions>
        <div className="admin-chat-log">
          {messages.length === 0 && <Text type="secondary">输入一句话，测试这个玩家会如何回应。</Text>}
          {messages.map((item, index) => (
            <div key={`${item.role}-${index}`} className={`admin-chat-message ${item.role}`}>
              <strong>{item.role === 'assistant' ? player.nickname || '玩家' : '你'}</strong>
              <p>{item.content}</p>
              {item.role === 'assistant' && item.content && (
                <Button size="small" icon={<PlayCircleOutlined />} disabled={!voice} loading={playingKey === `assistant-${index}`} onClick={() => playReply(item, index)}>播放</Button>
              )}
            </div>
          ))}
        </div>
        <Input.TextArea rows={3} value={input} onChange={(event) => setInput(event.target.value)} placeholder="输入调试消息" onPressEnter={(event) => {
          if (!event.shiftKey) { event.preventDefault(); send(); }
        }} />
        <Space>
          <Button type="primary" icon={<MessageOutlined />} loading={sending} onClick={send}>发送</Button>
        </Space>
        <audio ref={audioRef} hidden />
      </Space>
    </Modal>
  );
}
