import { playerSpeechSettings, type ModelDto } from '@battle/shared';
import { Form, InputNumber, Space } from 'antd';

export function PlayerSpeechFields({ models }: { readonly models: readonly ModelDto[] }) {
  const persona: string | undefined = Form.useWatch('persona');
  const modelId: number | null | undefined = Form.useWatch('modelId');
  const override: number | null | undefined = Form.useWatch('maxTokens');
  const suggested = playerSpeechSettings(persona ?? '');
  const model = models.find(item => item.id === modelId);
  const budget = override ?? suggested.maxTokens;
  return <>
    <Space align="start" wrap>
      <Form.Item name="temperature" label="温度">
        <InputNumber min={0} max={2} step={0.05} placeholder={String(suggested.temperature)} />
      </Form.Item>
      <Form.Item name="maxTokens" label="输出预算（tokens）">
        <InputNumber min={16} max={32000} precision={0} placeholder={String(suggested.maxTokens)} />
      </Form.Item>
      <Form.Item name="speechMaxChars" label="建议篇幅（字）">
        <InputNumber min={1} max={500} precision={0} placeholder={String(suggested.speechMaxChars)} />
      </Form.Item>
    </Space>
    <p style={{ marginTop: -12 }}>留空采用人设建议，填写数值可覆盖。{model && budget > model.maxTokens && `当前模型的输出上限为 ${model.maxTokens} tokens。`}</p>
  </>;
}
