import React, { useEffect } from 'react';
import { Form, Modal } from 'antd';

export function EntityModal({ open, title, initialValues, width = 640, onCancel, onSave, children }) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue(initialValues || {});
    }
  }, [form, initialValues, open]);

  return (
    <Modal
      open={open}
      width={width}
      title={title}
      onCancel={onCancel}
      onOk={() => form.submit()}
      destroyOnHidden
      forceRender
      styles={{ body: { overflow: 'hidden' } }}
    >
      <Form
        className="admin-entity-form"
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={initialValues}
        onFinish={onSave}
      >
        {children}
      </Form>
    </Modal>
  );
}
