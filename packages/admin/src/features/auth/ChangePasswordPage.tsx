import { App, Button, Card, Form, Input, Spin } from 'antd';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { changePassword } from '../../services/auth';
import { errorMessage } from '../../services/http';
import { useAuth } from './AuthContext';
import './auth.css';

interface PasswordValues {
  readonly currentPassword: string;
  readonly newPassword: string;
  readonly confirm: string;
}

export function ChangePasswordPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [submitting, setSubmitting] = useState(false);
  // 与 RequireAuth 一样先等账号信息加载完，刷新 /password 时才不会闪一下跳登录页
  if (auth.loading) return <Spin fullscreen />;
  if (!auth.profile) return <Navigate to="/login" replace />;

  const submit = async (values: PasswordValues) => {
    setSubmitting(true);
    try {
      await changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword });
      await auth.refresh();
      message.success('密码已修改');
      navigate('/', { replace: true });
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <Card title={auth.profile.mustChangePassword ? '首次登录，请修改初始密码' : '修改密码'} className="auth-card">
        <Form<PasswordValues> layout="vertical" onFinish={submit} requiredMark={false}>
          <Form.Item name="currentPassword" label="当前密码" rules={[{ required: true, message: '请输入当前密码' }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item name="newPassword" label="新密码" rules={[{ required: true, min: 12, message: '新密码至少 12 个字符' }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="确认新密码"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator: (_, value) => (value === getFieldValue('newPassword') ? Promise.resolve() : Promise.reject(new Error('两次输入不一致'))),
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={submitting}>保存</Button>
        </Form>
      </Card>
    </div>
  );
}
