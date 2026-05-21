import React from 'react';
import { Button, Space } from 'antd';
import { DeleteOutlined, EditOutlined } from '@ant-design/icons';

export function TableActions({ onEdit, editText = '编辑', onDelete, deleteText = '删除' }) {
  return (
    <Space>
      {onEdit && <Button size="small" icon={<EditOutlined />} onClick={onEdit}>{editText}</Button>}
      {onDelete && <Button size="small" danger icon={<DeleteOutlined />} onClick={onDelete}>{deleteText}</Button>}
    </Space>
  );
}
