import { Button, Card, Form, Input, message, Typography } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { changePassword, setToken } from '../../services/adminApi';
import { md5 } from '../../utils/crypto';

const { Title, Text } = Typography;

interface ChangePasswordValues {
  password: string;
  confirmPassword: string;
}

export function ChangePassword() {
  const [form] = Form.useForm<ChangePasswordValues>();
  const [messageApi, contextHolder] = message.useMessage();
  const navigate = useNavigate();

  const handleFinish = async ({ password }: ChangePasswordValues) => {
    try {
      const result = await changePassword(md5(password));
      setToken(result.token);
      messageApi.success('密码修改成功');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      messageApi.error((err as Error).message || '密码修改失败，请重试');
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
      {contextHolder}
      <Card style={{ width: 380, borderRadius: 8 }} bordered={false}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Title level={3} style={{ marginBottom: 4 }}>请修改初始密码</Title>
          <Text type="secondary">修改后才能继续使用管理后台</Text>
        </div>
        <Form form={form} onFinish={handleFinish} size="large">
          <Form.Item name="password" rules={[{ required: true, message: '请输入新密码' }, { min: 12, message: '密码至少 12 个字符' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="新密码" autoFocus />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            dependencies={['password']}
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({ validator: (_, value) => !value || getFieldValue('password') === value ? Promise.resolve() : Promise.reject(new Error('两次输入的密码不一致')) }),
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="确认新密码" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" block>确认修改</Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
