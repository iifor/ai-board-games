import { PROJECT_NAME } from '@battle/shared';
import { Layout, Menu } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { AccountMenu } from '../features/auth/AccountMenu';
import './AdminLayout.css';

const MENU = [
  { key: '/matches', label: '对局管理' },
  { key: '/prompts', label: '提示词管理' },
  { key: '/perspectives', label: '视角管理' },
  { key: '/players', label: '玩家管理' },
  { key: '/models', label: '模型管理' },
  { key: '/voices', label: '音色管理' },
  { key: '/access-codes', label: '身份码' },
];

export function AdminLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const selected = MENU.find((item) => pathname.startsWith(item.key));
  const menu = <div className="admin-navigation">
    <nav aria-label="后台菜单">
      <Menu mode="inline" selectedKeys={selected ? [selected.key] : []} items={MENU} onClick={({ key }) => {
        navigate(key);
      }} />
    </nav>
    <AccountMenu />
  </div>;
  return (
    <Layout className="admin-layout">
      <Layout.Sider theme="light">
        <div className="admin-brand">{PROJECT_NAME}</div>
        {menu}
      </Layout.Sider>
      <Layout>
        <Layout.Content className="admin-content" aria-label={selected?.label}>
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
