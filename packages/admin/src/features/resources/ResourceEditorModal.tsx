import { Form, Modal } from 'antd';
import type { ReactNode } from 'react';

interface Props<Values extends object> {
  readonly title: string;
  readonly initialValues: Partial<Values>;
  readonly saving: boolean;
  readonly onSave: (values: Values) => Promise<void>;
  readonly onCancel: () => void;
  readonly children: ReactNode;
}

export function ResourceEditorModal<Values extends object>({ title, initialValues, saving, onSave, onCancel, children }: Props<Values>) {
  const [form] = Form.useForm<Values>();
  return (
    <Modal open title={title} onOk={form.submit} confirmLoading={saving} onCancel={onCancel}>
      <Form form={form} initialValues={initialValues} onFinish={onSave} layout="vertical" autoComplete="off">
        {children}
      </Form>
    </Modal>
  );
}
