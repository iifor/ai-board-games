import type { ModelDto } from '@battle/shared';
import { App, Button, Space } from 'antd';
import { useState } from 'react';
import { errorMessage } from '../../services/http';
import { modelActions, modelsApi } from '../../services/resources';

interface Props {
  readonly model: ModelDto;
  readonly reload: () => void;
}

/** 连接测试；额度耗尽而被停用的模型，测试通过后可一键重新启用 */
export function ModelActions({ model, reload }: Props) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);

  const test = async (enableOnSuccess: boolean) => {
    setBusy(true);
    try {
      const result = await modelActions.test(model.id);
      if (!result.ok) {
        message.error(`连接失败：${result.message}`);
        return;
      }
      if (!enableOnSuccess) {
        message.success(`${result.message}（${result.latencyMs} ms）`);
        return;
      }
      await modelsApi.update(model.id, {
        providerId: model.providerId,
        name: model.name,
        model: model.model,
        temperature: model.temperature,
        maxTokens: model.maxTokens,
        fallbackModelId: model.fallbackModelId,
        enabled: true,
      });
      message.success('模型已重新启用');
      reload();
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Space>
      <Button size="small" loading={busy} onClick={() => test(false)}>测试</Button>
      {model.disabledReason === 'quota_exhausted' ? (
        <Button size="small" type="primary" ghost loading={busy} onClick={() => test(true)}>重新启用</Button>
      ) : null}
    </Space>
  );
}
