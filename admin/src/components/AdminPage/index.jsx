import React from 'react';
import {
  App as AntApp,
  Layout,
  Menu
} from 'antd';
import {
  DashboardOutlined,
  ExperimentOutlined,
  EyeOutlined,
  RobotOutlined,
  SkinOutlined,
  SoundOutlined,
  TeamOutlined,
  TrophyOutlined
} from '@ant-design/icons';
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { normalizePath } from '../../utils/adminHelpers';
import { Dashboard } from '../../pages/Dashboard';
import { GameHistory } from '../../pages/GameHistory';
import { PlayerManager } from '../../pages/PlayerManager';
import { ModelManager } from '../../pages/ModelManager';
import { ModelProviderManager } from '../../pages/ModelProviderManager';
import { VoiceManager } from '../../pages/VoiceManager';
import { WerewolfRoleManager } from '../../pages/WerewolfRoleManager';
import { WerewolfModeManager } from '../../pages/WerewolfModeManager';
import { SkinManager } from '../../pages/SkinManager';
import { TraceExplorer } from '../../pages/TraceExplorer';
import { TraceDetail } from '../../pages/TraceExplorer/TraceDetail';
import { AgentTraceView } from '../../pages/TraceExplorer/AgentTraceView';

const { Content, Sider } = Layout;

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
  {
    key: '/models',
    icon: <RobotOutlined />,
    label: '模型管理',
    children: [{ key: '/models/providers', label: '供应商列表' }]
  },
  { key: '/voices', icon: <SoundOutlined />, label: '语音管理' },
  { key: '/traces', icon: <EyeOutlined />, label: 'AI 观测' }
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
  const modelMenuPath = activePath.startsWith('/models/providers/') ? '/models/providers' : activePath;

  return (
    <Layout className="admin-layout">
      <Sider width={244} className="admin-sider">
        <a className="admin-brand" href="/">
          <strong>B 端管理后台</strong>
        </a>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[modelMenuPath]}
          defaultOpenKeys={['/debate', '/werewolf', '/consensus', '/models']}
          items={MENU_ITEMS}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout className="admin-main">
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
            <Route path="/models" element={<Navigate to="/models/providers" replace />} />
            <Route path="/models/providers" element={<ModelProviderManager />} />
            <Route path="/models/providers/:providerId" element={<ModelManager />} />
            <Route path="/voices" element={<VoiceManager />} />
            <Route path="/traces" element={<TraceExplorer />} />
            <Route path="/traces/:id" element={<TraceDetail />} />
            <Route path="/traces/:id/player/:playerId" element={<AgentTraceView />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}
