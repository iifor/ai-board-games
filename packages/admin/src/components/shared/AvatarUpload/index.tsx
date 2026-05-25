import { useState } from 'react';
import { App as AntApp, Avatar, Modal, Space, Upload } from 'antd';
import { CloudUploadOutlined, UserOutlined } from '@ant-design/icons';
import { adminRequest } from '../../../services/adminApi';
import { readFileAsDataUrl } from '../../../utils/adminHelpers';
import type { AvatarUploadProps } from '../../../types/components';
import type { RcFile } from 'antd/es/upload';

export function AvatarUpload({ value, onChange }: AvatarUploadProps) {
  const { message } = AntApp.useApp();
  const [uploading, setUploading] = useState(false);
  const [open, setOpen] = useState(false);

  async function beforeUpload(file: RcFile) {
    setUploading(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const result = await adminRequest<{ url: string }>('/uploads/image', {
        method: 'POST',
        body: JSON.stringify({ filename: file.name, dataUrl })
      });
      onChange?.(result.url);
      message.success('头像已上传');
      setOpen(false);
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setUploading(false);
    }
    return false;
  }

  return (
    <>
      <button type="button" className="admin-avatar-upload-trigger" onClick={() => setOpen(true)}>
        <Avatar size={72} src={value} icon={<UserOutlined />} />
        <span className="admin-avatar-upload-mask"><CloudUploadOutlined /></span>
      </button>
      <Modal open={open} title="上传玩家头像" footer={null} onCancel={() => setOpen(false)} destroyOnHidden>
        <Space direction="vertical" size={16} className="admin-full">
          <div className="admin-avatar-upload-preview">
            <Avatar size={96} src={value} icon={<UserOutlined />} />
          </div>
          <Upload.Dragger accept="image/png,image/jpeg,image/webp,image/gif" showUploadList={false} beforeUpload={beforeUpload} disabled={uploading}>
            <p className="ant-upload-drag-icon"><CloudUploadOutlined /></p>
            <p className="ant-upload-text">{uploading ? '正在上传...' : '点击或拖拽图片到这里上传'}</p>
            <p className="ant-upload-hint">支持 png、jpg、webp、gif，保存后直接展示数据库中的头像。</p>
          </Upload.Dragger>
        </Space>
      </Modal>
    </>
  );
}
