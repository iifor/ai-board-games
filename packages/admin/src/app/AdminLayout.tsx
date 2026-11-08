import { Button, Drawer, Layout, Menu } from 'antd';
import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../features/auth';
import './AdminLayout.css';

const MENU = [
  { key: '/matches', label: '对局与调试' },
  { key: '/traces', label: '整局调用链' },
  { key: '/players', label: 'AI 玩家' },
  { key: '/models', label: '模型' },
  { key: '/providers', label: '模型供应商' },
  { key: '/voices', label: '音色' },
];

export function AdminLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const auth = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const selected = MENU.find((item) => pathname.startsWith(item.key))?.key ?? '/matches';
  const menu = <Menu mode="inline" selectedKeys={[selected]} items={MENU} onClick={({ key }) => {
    setMenuOpen(false);
    navigate(key);
  }} />;
  return (
    <Layout className="admin-layout">
      <Layout.Sider breakpoint="md" collapsedWidth={0} trigger={null} theme="light" onBreakpoint={(narrow) => { if (!narrow) setMenuOpen(false); }}>
        <div className="admin-brand">AI 对战 · 后台</div>
        {menu}
      </Layout.Sider>
      <Layout>
        <Layout.Header className="admin-header">
          <Button className="admin-menu-toggle" aria-haspopup="dialog" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>导航</Button>
          <span>{auth.profile?.username}</span>
          <Button size="small" onClick={() => navigate('/password')}>修改密码</Button>
          <Button size="small" onClick={auth.logout}>退出</Button>
        </Layout.Header>
        <Layout.Content className="admin-content">
          <Outlet />
        </Layout.Content>
      </Layout>
      <Drawer title="后台导航" placement="left" size="min(280px, 85vw)" open={menuOpen} onClose={() => setMenuOpen(false)}>{menu}</Drawer>
    </Layout>
  );
}
