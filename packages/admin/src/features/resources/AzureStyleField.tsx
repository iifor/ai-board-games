import { Alert, Button, Form, Select } from 'antd';
import { useAsync } from '../../hooks/useAsync';
import { voiceActions } from '../../services/resources';
import { voiceStyleLabel } from './voiceStyles';

export function AzureStyleField() {
  const form = Form.useFormInstance();
  const voiceName: string = Form.useWatch('voiceName', form) ?? '';
  const style: string = Form.useWatch('style', form) ?? '';
  const catalog = useAsync(voiceActions.azureCatalog, []);
  const voice = catalog.status === 'ready'
    ? catalog.data.find(item => item.voiceName.toLowerCase() === voiceName.trim().toLowerCase())
    : undefined;
  const supported = voice?.styles ?? [];
  const legacyStyle = !!style && !supported.includes(style);
  const options = ['', ...supported].map(value => ({ value, label: voiceStyleLabel(value), disabled: false }));
  if (legacyStyle) options.push({ value: style, label: `${voiceStyleLabel(style)} · 原配置`, disabled: true });

  let extra = '正在加载可选风格…';
  if (catalog.status === 'ready') {
    if (!voiceName.trim()) extra = '请先填写音色名。';
    else if (!voice) extra = '当前区域目录未找到此音色，暂时只能选择自然风格。';
    else if (!supported.length) extra = '此音色只提供自然风格。';
    else extra = '';
    if (legacyStyle) extra = `${extra} 原配置未在当前风格列表中，可保留或重新选择。`.trim();
  }

  return <>
    <Form.Item name="style" label="风格" initialValue="" extra={catalog.status === 'error' ? undefined : extra}>
      <Select showSearch optionFilterProp="label" options={options}
        components={{ input: <input autoComplete="off" spellCheck={false} /> }}
        loading={catalog.status === 'loading'} disabled={catalog.status === 'loading'} />
    </Form.Item>
    {catalog.status === 'error' && <Alert type="warning" title={catalog.message}
      description="可保留原配置或选择自然风格。"
      action={<Button size="small" onClick={catalog.invalidate}>重试</Button>} />}
  </>;
}
