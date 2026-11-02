import type { CreateDebugMatchRequest } from '@battle/shared';
import { App, Form, InputNumber, Modal, Select, Switch } from 'antd';
import { useState } from 'react';
import { useAsync } from '../../../hooks/useAsync';
import { errorMessage } from '../../../services/http';
import { createDebugMatch, fetchCatalog, fetchPhaseGraph } from '../../../services/matches';
import { playersApi } from '../../../services/resources';

interface Values {
  gameKey: string;
  variant?: string;
  playerIds: number[];
  seed?: number;
  breakpoints: string[];
  pacing: 'ack' | 'free';
  scripted: boolean;
  chaos: boolean;
}

const CHAOS_HELP = '弃票 / 放弃 / 自爆 / 非法输出 / 模拟调用失败，用于检查舞台对这些情况的呈现';

/** 创建调试局：可指定种子、断点、推进节奏，是否用脚本化输出代替真实模型，以及脚本化时是否改用混沌脚本 */
export function CreateDebugMatchModal({ open, onClose, onCreated }: { readonly open: boolean; readonly onClose: () => void; readonly onCreated: (id: string) => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<Values>();
  const [saving, setSaving] = useState(false);
  const gameKey = Form.useWatch('gameKey', form);
  const scripted = Form.useWatch('scripted', form);
  const catalog = useAsync(fetchCatalog, []);
  const players = useAsync(playersApi.list, []);
  const graph = useAsync(() => (gameKey ? fetchPhaseGraph(gameKey) : Promise.resolve(null)), [gameKey]);
  const game = catalog.status === 'ready' ? catalog.data.find((item) => item.key === gameKey) : undefined;

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const request: CreateDebugMatchRequest = {
        gameKey: values.gameKey,
        variant: values.variant,
        playerIds: values.playerIds,
        seed: values.seed,
        breakpoints: values.breakpoints.includes('*all') ? 'all' : values.breakpoints,
        pacing: values.pacing,
        scripted: values.scripted,
        // 混沌脚本只在脚本化时有意义；关掉脚本化后不把它带给服务端
        chaos: values.scripted && values.chaos,
      };
      const match = await createDebugMatch(request);
      onCreated(match.id);
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="创建调试局" open={open} onOk={submit} confirmLoading={saving} onCancel={onClose} destroyOnHidden width={640}>
      <Form form={form} layout="vertical" initialValues={{ breakpoints: [], pacing: 'free', scripted: true, chaos: false, playerIds: [] }}>
        <Form.Item name="gameKey" label="游戏" rules={[{ required: true }]}>
          <Select options={catalog.status === 'ready' ? catalog.data.map((item) => ({ value: item.key, label: item.title })) : []} />
        </Form.Item>
        {game?.variants.length ? (
          <Form.Item name="variant" label="板子" initialValue={game.defaultVariant ?? undefined}>
            <Select options={game.variants.map((variant) => ({ value: variant.key, label: variant.name }))} />
          </Form.Item>
        ) : null}
        <Form.Item name="playerIds" label={`玩家（按选择顺序就座${game ? `，${game.players.min}–${game.players.max} 人` : ''}）`} rules={[{ required: true, type: 'array', min: 1 }]}>
          <Select mode="multiple" options={players.status === 'ready' ? players.data.filter((item) => item.enabled).map((item) => ({ value: item.id, label: item.name })) : []} />
        </Form.Item>
        <Form.Item name="seed" label="种子（留空随机）"><InputNumber min={0} max={4294967295} style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="breakpoints" label="断点（在进入这些阶段前暂停）">
          <Select mode="multiple" options={[{ value: '*all', label: '全部阶段' }, ...(graph.status === 'ready' && graph.data ? graph.data.phases.map((phase) => ({ value: phase.id, label: phase.title ? `${phase.id}（${phase.title}）` : phase.id })) : [])]} />
        </Form.Item>
        <Form.Item name="pacing" label="推进节奏">
          <Select options={[{ value: 'free', label: '不等待观众（连续生成）' }, { value: 'ack', label: '按观众播放确认推进' }]} />
        </Form.Item>
        <Form.Item name="scripted" label="脚本化（不调用模型与云端语音）" valuePropName="checked">
          <Switch onChange={(checked) => { if (!checked) form.setFieldValue('chaos', false); }} />
        </Form.Item>
        <Form.Item name="chaos" label="混沌脚本" valuePropName="checked" extra={CHAOS_HELP}>
          <Switch disabled={!scripted} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
