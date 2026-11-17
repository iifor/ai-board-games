import { KeyOutlined, LogoutOutlined, MoreOutlined } from '@ant-design/icons';
import { App, Dropdown, type MenuProps } from 'antd';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { errorMessage } from '../../services/http';
import { useAuth } from './AuthContext';
import './AccountMenu.css';

const items = [
  { key: 'password', icon: <KeyOutlined />, label: '修改密码' },
  { type: 'divider' },
  { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', danger: true },
] satisfies NonNullable<MenuProps['items']>;

export function AccountMenu() {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  if (!profile) return null;
  const { username } = profile;
  return (
    <footer className="admin-account" onKeyDownCapture={(event) => {
      if (open && event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }}>
      <Dropdown trigger={['click']} placement="topLeft" autoFocus open={open} onOpenChange={setOpen}
        getPopupContainer={(trigger) => trigger.parentElement!}
        menu={{ items, 'aria-label': '账号操作', onClick: ({ key }) => {
          setOpen(false);
          if (key === 'password') navigate('/password');
          if (key === 'logout') {
            logout().catch((error: unknown) => message.warning(`已在本机退出，但服务端未能注销登录：${errorMessage(error)}`));
          }
        } }}>
        <button ref={triggerRef} type="button" className="admin-account-trigger" aria-haspopup="menu" aria-expanded={open}
          aria-label={`${username} 的账号菜单`} title={username}>
          <span className="admin-account-avatar" aria-hidden="true">{Array.from(username.trim())[0]?.toUpperCase()}</span>
          <span className="admin-account-name">{username}</span>
          <MoreOutlined rotate={90} aria-hidden="true" className="admin-account-more" />
        </button>
      </Dropdown>
    </footer>
  );
}
