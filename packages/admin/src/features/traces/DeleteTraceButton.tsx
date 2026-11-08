import { App, Button, Popconfirm } from 'antd';
import { useState } from 'react';
import { errorMessage } from '../../services/http';
import { deleteTrace } from '../../services/traces';

export function DeleteTraceButton({ id }: { id: string }) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    try {
      await deleteTrace(id);
      message.success('调用链与模型调用明细已清除');
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return <Popconfirm title="永久删除这条调用链？" description="清除本局的采集记录、模型调用明细与后台缓存，并停止后续采集。对局和回放会保留。"
    okText="删除调用链" cancelText="取消" okButtonProps={{ danger: true }} onConfirm={remove}>
    <Button danger size="small" loading={busy}>删除调用链</Button>
  </Popconfirm>;
}
