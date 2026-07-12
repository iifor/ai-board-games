import {
  App as AntApp,
  Layout,
  Menu,
  Button
} from 'antd';
import {
  DashboardOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  EyeOutlined,
  LogoutOutlined,
  PartitionOutlined,
  SettingOutlined,
  TrophyOutlined
} from '@ant-design/icons';
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { normalizePath } from '../../utils/adminHelpers';
import { getToken, clearToken } from '../../services/adminApi';
import { Login } from '../../pages/Login';
import { Dashboard } from '../../pages/Dashboard';
import { GameHistory } from '../../pages/GameHistory';
import { PlayerManager } from '../../pages/PlayerManager';
import { ModelManager } from '../../pages/ModelManager';
import { ModelProviderManager } from '../../pages/ModelProviderManager';
import { VoiceManager } from '../../pages/VoiceManager';
import { WerewolfRoleManager } from '../../pages/WerewolfRoleManager';
import { WerewolfModeManager } from '../../pages/WerewolfModeManager';
import { PublicSettings } from '../../pages/PublicSettings';
import { TraceExplorer } from '../../pages/TraceExplorer';
import { TraceDetail } from '../../pages/TraceExplorer/TraceDetail';
import { AgentTraceView } from '../../pages/TraceExplorer/AgentTraceView';
import { WorkflowDebugConsole } from '../../pages/WorkflowDebugConsole';
import { MemoryManager } from '../../pages/MemoryManager';
import type { ItemType } from 'antd/es/menu/interface';

const { Content, Sider } = Layout;

const MENU_ITEMS: ItemType[] = [
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
    key: '/system',
    icon: <SettingOutlined />,
    label: '系统设置',
    children: [
      { key: '/system/public-settings', label: '公共设置' },
      { key: '/system/players', label: '玩家管理' },
      { key: '/system/voices', label: '语音管理' },
      { key: '/system/models', label: '模型管理' }
    ]
  },
  { key: '/traces', icon: <EyeOutlined />, label: 'AI 观测' },
  { key: '/memories', icon: <DatabaseOutlined />, label: '记忆管理' },
  { key: '/workflow-debug', icon: <PartitionOutlined />, label: '工作流调试' }
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
  const isLoginPage = location.pathname === '/login';

  if (isLoginPage) {
    return <Login />;
  }

  if (!getToken()) {
    return <Login />;
  }

  const activePath = normalizePath(location.pathname);
  const modelMenuPath = activePath.startsWith('/system/models/providers/') ? '/system/models' : activePath;

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
          defaultOpenKeys={['/debate', '/werewolf', '/system']}
          items={MENU_ITEMS}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout className="admin-main">
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', padding: '0 24px', height: 48, background: '#fff', borderBottom: '1px solid #f0f0f0' }}>
          <Button
            type="text"
            icon={<LogoutOutlined />}
            onClick={() => { clearToken(); window.location.hash = '#/login'; }}
          >
            退出登录
          </Button>
        </div>
        <Content className="admin-content">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/debate/history" element={<GameHistory gameType="debate" />} />
            <Route path="/werewolf/history" element={<GameHistory gameType="werewolf" />} />
            <Route path="/werewolf/roles" element={<WerewolfRoleManager />} />
            <Route path="/werewolf/modes" element={<WerewolfModeManager />} />
            <Route path="/system/public-settings" element={<PublicSettings />} />
            <Route path="/system/players" element={<PlayerManager />} />
            <Route path="/system/voices" element={<VoiceManager />} />
            <Route path="/system/models" element={<Navigate to="/system/models/providers" replace />} />
            <Route path="/system/models/providers" element={<ModelProviderManager />} />
            <Route path="/system/models/providers/:providerId" element={<ModelManager />} />
            <Route path="/traces" element={<TraceExplorer />} />
            <Route path="/traces/:id" element={<TraceDetail />} />
            <Route path="/traces/:id/player/:playerId" element={<AgentTraceView />} />
            <Route path="/memories" element={<MemoryManager />} />
            <Route path="/workflow-debug" element={<WorkflowDebugConsole />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}
