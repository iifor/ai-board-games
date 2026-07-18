import { Button, Card, Form, Input, message, Typography } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { setToken } from '../../services/adminApi';
import { md5 } from '../../utils/crypto';

const { Title } = Typography;

interface LoginValues {
  username: string;
  password: string;
}

export function Login() {
  const [form] = Form.useForm<LoginValues>();
  const [messageApi, contextHolder] = message.useMessage();
  const navigate = useNavigate();

  const handleFinish = async (values: LoginValues) => {
    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: values.username, password: md5(values.password) }),
      });
      const data = await res.json().catch(() => null) as Record<string, unknown> | null;
      if (!res.ok || !data?.data) {
        throw new Error((data?.message as string) || '登录失败');
      }
      const loginData = data.data as { token: string; mustChangePassword: boolean; user: Record<string, unknown> };
      setToken(loginData.token, loginData.mustChangePassword);
      messageApi.success('登录成功');
      navigate(loginData.mustChangePassword ? '/change-password' : '/dashboard', { replace: true });
    } catch (err) {
      messageApi.error((err as Error).message || '登录失败，请重试');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f0f2f5',
    }}>
      {contextHolder}
      <Card style={{ width: 380, borderRadius: 8 }} bordered={false}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Title level={3} style={{ marginBottom: 4 }}>B 端管理后台</Title>
          <Typography.Text type="secondary">请登录以继续</Typography.Text>
        </div>
        <Form form={form} onFinish={handleFinish} size="large">
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" autoFocus />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" block>
              登录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
