import { App, Button, Popconfirm } from 'antd';
import { useState } from 'react';
import { errorMessage } from '../../services/http';
import { forgetPlayerMemory } from '../../services/playerMemory';

interface Props {
  owner: number;
  name: string;
  memoryId?: number;
  onForgotten: () => void;
}

export function ForgetMemoryButton({ owner, name, memoryId, onForgotten }: Props) {
  const [busy, setBusy] = useState(false);
  const { message } = App.useApp();
  const all = memoryId === undefined;
  async function forget() {
    setBusy(true);
    try {
      const result = await forgetPlayerMemory(owner, memoryId);
      message.success(all ? `已清空 ${result.forgotten} 条记忆，取消 ${result.cancelledReviews} 个旧复盘任务` : '已忘记这条记忆');
      onForgotten();
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return <Popconfirm title={all ? `清空「${name}」的全部跨局记忆？` : `忘记「${name}」的记忆 M${memoryId}？`}
    description={all ? '范围包括所有玩法和分页。新局从空记忆开始，旧局复盘停止写入。原始对局和回放保留。'
      : '下一局起不再取回这条记忆。原始对局和回放保留。'}
    okText={all ? '确认清空' : '确认忘记'} cancelText="取消" okButtonProps={{ danger: true, loading: busy }} onConfirm={forget}>
    <Button danger size={all ? 'middle' : 'small'} loading={busy}>{all ? '一键清空记忆' : '忘记这条'}</Button>
  </Popconfirm>;
}
