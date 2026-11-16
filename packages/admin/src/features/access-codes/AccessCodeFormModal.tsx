import type { AccessCodeDto } from '@battle/shared';
import { Button, Form, Input, InputNumber, Modal, Space, Switch } from 'antd';
import { formatTime } from '../../utils/format';
import { MAX_VALIDITY_DAYS, VALIDITY_PRESETS } from './constants';
import type { AccessCodeFormValues } from './types';
import { defaultFormValues, formValuesOf } from './utils';

interface Props {
  /** null 为新建 */
  readonly editing: AccessCodeDto | null;
  readonly saving: boolean;
  readonly onSave: (values: AccessCodeFormValues) => Promise<void>;
  readonly onCancel: () => void;
}

/** 新建或编辑身份码：用户名、有效期（从现在起的天数）、可选局数上限、停用 */
export function AccessCodeFormModal({ editing, saving, onSave, onCancel }: Props) {
  const [form] = Form.useForm<AccessCodeFormValues>();
  const limited = Form.useWatch('limited', form);
  return (
    <Modal open title={editing ? '编辑身份码' : '新建身份码'} okText={editing ? '保存' : '生成身份码'}
      onOk={form.submit} confirmLoading={saving} onCancel={onCancel} destroyOnHidden>
      <Form<AccessCodeFormValues> form={form} layout="vertical" autoComplete="off" onFinish={onSave}
        initialValues={editing ? formValuesOf(editing) : defaultFormValues()}>
        <Form.Item name="username" label="用户名" rules={[{ required: true, whitespace: true, message: '请填写用户名' }, { max: 32 }]}
          extra="用来标识发给了谁，会显示在对局详情的「发起人」里">
          <Input placeholder="如：张三" />
        </Form.Item>
        <Form.Item label="有效期" required={!editing}
          extra={editing ? `当前有效期至 ${formatTime(editing.expiresAt)}；留空保持不变，填写则从现在起重新计算` : '从现在起计算'}>
          <Space wrap>
            <Form.Item name="validityDays" noStyle rules={editing ? [] : [{ required: true, message: '请填写有效天数' }]}>
              <InputNumber min={1} max={MAX_VALIDITY_DAYS} precision={0} suffix="天" style={{ width: 140 }} />
            </Form.Item>
            {VALIDITY_PRESETS.map((days) => (
              <Button key={days} size="small" onClick={() => form.setFieldValue('validityDays', days)}>{days} 天</Button>
            ))}
          </Space>
        </Form.Item>
        <Form.Item name="limited" label="限制开局数" valuePropName="checked">
          <Switch />
        </Form.Item>
        {limited ? (
          <Form.Item name="maxMatches" label="最多可开局数" rules={[{ required: true, message: '请填写局数' }]}
            extra={editing ? `已使用 ${editing.usedMatches} 局` : undefined}>
            <InputNumber min={1} max={100000} precision={0} suffix="局" style={{ width: 140 }} />
          </Form.Item>
        ) : null}
        {editing ? (
          <Form.Item name="disabled" label="停用" valuePropName="checked" extra="停用后立即不能再开局，已开始的对局不受影响">
            <Switch />
          </Form.Item>
        ) : null}
      </Form>
    </Modal>
  );
}
