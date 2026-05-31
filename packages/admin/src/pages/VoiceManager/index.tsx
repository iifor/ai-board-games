import { useEffect, useRef, useState } from 'react';
import { App as AntApp, Button, Card, Form, Input, Select, Space, Switch, Table, Tag } from 'antd';
import { PlayCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { adminRequest } from '../../services/adminApi';
import { emptyVoice } from '../../constants/adminConstants';
import { filterByQuery, uniqueOptions, booleanOptions, formatVoiceProvider, playVoicePackage } from '../../utils/adminHelpers';
import { EntityModal } from '../../components/shared/EntityModal';
import { TableActions } from '../../components/shared/TableActions';
import { ListFilterBar } from '../../components/shared/ListFilterBar';
import type { VoicePackage } from '../../types/entities';
import type { FilterState } from '../../types/api';

export function VoiceManager() {
  const { message } = AntApp.useApp();
  const [voices, setVoices] = useState<VoicePackage[]>([]);
  const [editing, setEditing] = useState<VoicePackage | null>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [filters, setFilters] = useState<FilterState>({});
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    adminRequest<VoicePackage[]>('/voice-packages').then(setVoices).catch(() => {});
  }, []);

  const filteredVoices = filterByQuery(
    voices
      .filter((voice) => !filters.provider || voice.provider === filters.provider)
      .filter((voice) => !filters.language || voice.language === filters.language)
      .filter((voice) => !filters.gender || voice.gender === filters.gender)
      .filter((voice) => filters.enabled === undefined || voice.enabled === filters.enabled),
    filters.q,
    ['name', 'provider', 'voiceId', 'language', 'gender', 'style', 'description']
  );

  async function refresh() {
    adminRequest<VoicePackage[]>('/voice-packages').then(setVoices).catch(() => {});
  }

  async function save(values: Record<string, unknown>) {
    const path = editing?.id ? `/voice-packages/${editing.id}` : '/voice-packages';
    const method = editing?.id ? 'PUT' : 'POST';
    await adminRequest(path, { method, body: JSON.stringify(values) });
    message.success('语音包已保存');
    setEditing(null);
    await refresh();
  }

  async function remove(id: number) {
    await adminRequest(`/voice-packages/${id}`, { method: 'DELETE' });
    message.success('语音包已删除');
    await refresh();
  }

  async function playVoice(voice: VoicePackage, text?: string) {
    setPlayingId(voice.id);
    try {
      await playVoicePackage(voice, text || voice.sampleText, audioRef);
      message.success('已开始试听');
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setPlayingId(null);
    }
  }

  const enabledTag = (value: boolean) => <Tag color={value ? 'green' : 'default'}>{value ? '启用' : '停用'}</Tag>;

  return (
    <>
      <Card title="语音列表" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({} as VoicePackage)}>新增语音包</Button>}>
        <ListFilterBar
          value={filters}
          onChange={setFilters}
          searchPlaceholder="搜索名称、Voice ID、风格、说明"
          selects={[
            { key: 'provider', placeholder: '供应商', options: uniqueOptions(voices.map((voice) => voice.provider), formatVoiceProvider) },
            { key: 'language', placeholder: '语言', options: uniqueOptions(voices.map((voice) => voice.language)) },
            { key: 'gender', placeholder: '性别', options: uniqueOptions(voices.map((voice) => voice.gender)) },
            { key: 'enabled', placeholder: '状态', options: booleanOptions() }
          ]}
        />
        <Table rowKey="id" dataSource={filteredVoices} columns={[
          { title: '名称', dataIndex: 'name' },
          { title: '供应商', dataIndex: 'provider', render: formatVoiceProvider },
          { title: 'Voice ID', dataIndex: 'voiceId', render: (value: string) => value || '-' },
          { title: '语言', dataIndex: 'language', render: (value: string) => value || '-' },
          { title: '性别', dataIndex: 'gender', render: (value: string) => value || '-' },
          { title: '说明', dataIndex: 'description', ellipsis: true },
          { title: '启用', dataIndex: 'enabled', render: enabledTag },
          {
            title: '操作',
            width: 300,
            render: (_: unknown, record: VoicePackage) => (
              <Space>
                <Button size="small" icon={<PlayCircleOutlined />} loading={playingId === record.id} onClick={() => playVoice(record)}>试听</Button>
                <TableActions onEdit={() => setEditing(record)} onDelete={() => remove(record.id)} />
              </Space>
            )
          }
        ]} />
      </Card>
      <audio ref={audioRef} hidden />
      <VoiceModal open={editing !== null} initialValues={editing} onCancel={() => setEditing(null)} onSave={save} />
    </>
  );
}

interface VoiceModalProps {
  open: boolean;
  initialValues: VoicePackage | null;
  onCancel: () => void;
  onSave: (values: Record<string, unknown>) => void;
}

function VoiceModal({ open, initialValues, onCancel, onSave }: VoiceModalProps) {
  return (
    <EntityModal open={open} title={initialValues?.id ? '编辑语音包' : '新增语音包'} initialValues={{ ...emptyVoice, ...(initialValues || {}) }} onCancel={onCancel} onSave={onSave}>
      <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}><Input /></Form.Item>
      <Form.Item name="provider" label="供应商">
        <Select options={[
          { value: 'browser', label: '浏览器本地语音' },
          { value: 'azure', label: 'Azure Speech' },
          { value: 'mimo', label: 'Mimo TTS' }
        ]} />
      </Form.Item>
      <Form.Item name="voiceId" label="Voice ID"><Input placeholder="如 zh-CN-XiaoxiaoNeural" /></Form.Item>
      <Form.Item name="language" label="语言"><Input placeholder="zh-CN" /></Form.Item>
      <Form.Item name="gender" label="性别"><Select allowClear options={['男', '女', '中性'].map((value) => ({ value, label: value }))} /></Form.Item>
      <Form.Item name="style" label="风格"><Input placeholder="如 cheerful、sad、angry，需目标语音支持" /></Form.Item>
      <Form.Item name="rate" label="语速"><Input placeholder="0%、+10%、-10%" /></Form.Item>
      <Form.Item name="pitch" label="音调"><Input placeholder="0%、+5%、-5%" /></Form.Item>
      <Form.Item name="temperature" label="语音温度"><Input type="number" min={0} max={2} step={0.1} /></Form.Item>
      <Form.Item name="sampleText" label="试听文本"><Input.TextArea rows={2} /></Form.Item>
      <Form.Item name="description" label="说明"><Input.TextArea rows={3} /></Form.Item>
      <Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item>
    </EntityModal>
  );
}
