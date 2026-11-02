import { VOICE_GENDERS, VOICE_PROVIDERS } from '@battle/shared';
import { Form, Input, Select, Switch } from 'antd';
import { PROVIDER_LABELS } from './constants';

/** 音色表单：Azure 用风格 / 语速 / 音调（SSML），Mimo 的风格是朗读口吻的文字指令，浏览器朗读只用语言 */
export function VoiceFormFields() {
  return (
    <>
      <Form.Item name="name" label="名称" extra="名为「主持人」的音色用于主持播报" rules={[{ required: true }]}><Input /></Form.Item>
      <Form.Item name="provider" label="来源" rules={[{ required: true }]}>
        <Select options={VOICE_PROVIDERS.map((value) => ({ value, label: PROVIDER_LABELS[value] }))} />
      </Form.Item>
      <Form.Item name="voiceName" label="音色名" extra="Azure 如 zh-CN-XiaoxiaoNeural；Mimo 如 冰糖" rules={[{ required: true }]}><Input /></Form.Item>
      <Form.Item name="language" label="语言" rules={[{ required: true }]}><Input placeholder="zh-CN" /></Form.Item>
      <Form.Item name="gender" label="性别">
        <Select allowClear options={VOICE_GENDERS.map((value) => ({ value, label: value }))} />
      </Form.Item>
      <Form.Item name="style" label="风格" extra="Azure：express-as 风格名（cheerful、calm…，需音色支持）；Mimo：一句朗读口吻的指令">
        <Input.TextArea rows={2} />
      </Form.Item>
      <Form.Item name="rate" label="语速（Azure）" rules={[{ pattern: /^[+-]?\d+(\.\d+)?%$/, message: '请填写百分比，如 0%、+10%' }]}><Input placeholder="0%" /></Form.Item>
      <Form.Item name="pitch" label="音调（Azure）" rules={[{ pattern: /^[+-]?\d+(\.\d+)?%$/, message: '请填写百分比，如 0%、+5%' }]}><Input placeholder="0%" /></Form.Item>
      <Form.Item name="sampleText" label="试听文本"><Input.TextArea rows={2} maxLength={200} /></Form.Item>
      <Form.Item name="description" label="说明"><Input.TextArea rows={2} maxLength={500} /></Form.Item>
      <Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item>
    </>
  );
}
