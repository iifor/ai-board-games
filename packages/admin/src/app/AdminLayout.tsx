import { Button, Layout, Menu } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../features/auth';
import './AdminLayout.css';

const MENU = [
  { key: '/matches', label: '对局与调试' },
  { key: '/players', label: 'AI 玩家' },
  { key: '/models', label: '模型' },
  { key: '/providers', label: '模型供应商' },
  { key: '/voices', label: '音色' },
];

export function AdminLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const auth = useAuth();
  const selected = MENU.find((item) => pathname.startsWith(item.key))?.key ?? '/matches';
  return (
    <Layout className="admin-layout">
      <Layout.Sider breakpoint="md" collapsedWidth={0} theme="light">
        <div className="admin-brand">AI 对战 · 后台</div>
        <Menu mode="inline" selectedKeys={[selected]} items={MENU} onClick={({ key }) => navigate(key)} />
      </Layout.Sider>
      <Layout>
        <Layout.Header className="admin-header">
          <span>{auth.profile?.username}</span>
          <Button size="small" onClick={() => navigate('/password')}>修改密码</Button>
          <Button size="small" onClick={auth.logout}>退出</Button>
        </Layout.Header>
        <Layout.Content className="admin-content">
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
