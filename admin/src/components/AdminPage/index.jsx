import React from 'react';
import {
  App as AntApp,
  Layout,
  Menu,
  Typography
} from 'antd';
import {
  DashboardOutlined,
  ExperimentOutlined,
  RobotOutlined,
  SkinOutlined,
  SoundOutlined,
  TeamOutlined,
  TrophyOutlined
} from '@ant-design/icons';
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { TITLES } from '../../constants/adminConstants';
import { normalizePath } from '../../utils/adminHelpers';
import { Dashboard } from '../../pages/Dashboard';
import { GameHistory } from '../../pages/GameHistory';
import { PlayerManager } from '../../pages/PlayerManager';
import { ModelManager } from '../../pages/ModelManager';
import { VoiceManager } from '../../pages/VoiceManager';
import { WerewolfRoleManager } from '../../pages/WerewolfRoleManager';
import { WerewolfModeManager } from '../../pages/WerewolfModeManager';
import { SkinManager } from '../../pages/SkinManager';

const { Header, Content, Sider } = Layout;
const { Title } = Typography;

const MENU_ITEMS = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
  {
    key: '/debate',
    icon: <TrophyOutlined />,
    label: '辩论赛',
    children: [{ key: '/debate/history', label: '对局历史' }]
  },
  {
    key: '/werewolf',
    icon: <ExperimentOutlined />,
    label: '狼人杀',
    children: [
      { key: '/werewolf/history', label: '对局历史' },
      { key: '/werewolf/roles', label: '角色管理' },
      { key: '/werewolf/modes', label: '模式选择' }
    ]
  },
  {
    key: '/consensus',
    icon: <SkinOutlined />,
    label: '共识迷雾',
    children: [
      { key: '/consensus/history', label: '对局历史' },
      { key: '/consensus/skins', label: '皮肤管理' }
    ]
  },
  { key: '/players', icon: <TeamOutlined />, label: '玩家管理' },
  { key: '/models', icon: <RobotOutlined />, label: '模型管理' },
  { key: '/voices', icon: <SoundOutlined />, label: '语音管理' }
];

export function AdminPage() {
  return (
    <AntApp>
      <HashRouter>
        <AdminShell />
      </HashRouter>
    </AntApp>
  );
}

function AdminShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const activePath = normalizePath(location.pathname);

  return (
    <Layout className="admin-layout">
      <Sider width={244} className="admin-sider">
        <a className="admin-brand" href="/">
          <strong>B 端管理后台</strong>
        </a>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[activePath]}
          defaultOpenKeys={['/debate', '/werewolf', '/consensus']}
          items={MENU_ITEMS}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header className="admin-header">
          <Title level={3}>{TITLES[activePath] || '仪表盘'}</Title>
        </Header>
        <Content className="admin-content">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/debate/history" element={<GameHistory gameType="debate" />} />
            <Route path="/werewolf/history" element={<GameHistory gameType="werewolf" />} />
            <Route path="/werewolf/roles" element={<WerewolfRoleManager />} />
            <Route path="/werewolf/modes" element={<WerewolfModeManager />} />
            <Route path="/consensus/history" element={<GameHistory gameType="consensus" />} />
            <Route path="/consensus/skins" element={<SkinManager />} />
            <Route path="/players" element={<PlayerManager />} />
            <Route path="/models" element={<ModelManager />} />
            <Route path="/voices" element={<VoiceManager />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}
