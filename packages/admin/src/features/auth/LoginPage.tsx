import { App, Button, Card, Form, Input } from 'antd';
import { useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { errorMessage } from '../../services/http';
import { useAuth } from './AuthContext';
import './auth.css';

interface LoginValues {
  readonly username: string;
  readonly password: string;
}

export function LoginPage() {
  const auth = useAuth();
  const { message } = App.useApp();
  const [submitting, setSubmitting] = useState(false);
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';
  if (auth.profile) return <Navigate to={auth.profile.mustChangePassword ? '/password' : from} replace />;

  const submit = async (values: LoginValues) => {
    setSubmitting(true);
    try {
      await auth.login(values.username, values.password);
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <Card title="AI 对战 · 管理后台" className="auth-card">
        <Form<LoginValues> layout="vertical" onFinish={submit} requiredMark={false}>
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={submitting}>登录</Button>
        </Form>
      </Card>
    </div>
  );
}
