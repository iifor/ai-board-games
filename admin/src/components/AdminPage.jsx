import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  App as AntApp,
  Avatar,
  Button,
  Card,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Layout,
  Menu,
  Modal,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload
} from 'antd';
import {
  ApiOutlined,
  CloudUploadOutlined,
  DashboardOutlined,
  DeleteOutlined,
  EditOutlined,
  ExperimentOutlined,
  MessageOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  RobotOutlined,
  SkinOutlined,
  SoundOutlined,
  TeamOutlined,
  TrophyOutlined,
  UserOutlined
} from '@ant-design/icons';
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { adminRequest } from '../api/adminApi';

const { Header, Content, Sider } = Layout;
const { Title, Text } = Typography;

const GAME_LABELS = { debate: '辩论赛', werewolf: '狼人杀', consensus: '共识迷雾' };
const DEBATE_ROLE_LABELS = ['一辩', '二辩', '三辩', '四辩'];

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

const TITLES = {
  '/dashboard': '仪表盘',
  '/debate/history': '辩论赛 / 对局历史',
  '/werewolf/history': '狼人杀 / 对局历史',
  '/werewolf/roles': '狼人杀 / 角色管理',
  '/werewolf/modes': '狼人杀 / 模式选择',
  '/consensus/history': '共识迷雾 / 对局历史',
  '/consensus/skins': '共识迷雾 / 皮肤管理',
  '/players': '玩家管理',
  '/models': '模型管理',
  '/voices': '语音管理'
};

const API_FORMAT_OPTIONS = [
  { value: 'openai-compatible', label: 'OpenAI 兼容' },
  { value: 'anthropic-compatible', label: 'Anthropic 兼容' }
];

const emptyPlayer = {
  nickname: '',
  avatar: '',
  sex: '未知',
  personality: '',
  modelId: null,
  voicePackageId: null,
  enabled: true
};

const emptySkin = {
  name: '',
  version: 'v3.2',
  source: 'admin',
  terms: {},
  background: '',
  truth: '',
  clues: [],
  noises: [],
  memoryExamples: [],
  enabled: true
};

const emptyVoice = {
  name: '',
  provider: 'browser',
  voiceId: '',
  language: 'zh-CN',
  gender: '',
  style: '',
  rate: '0%',
  pitch: '0%',
  temperature: 0.85,
  sampleText: '你好，我是本局玩家的试听声音。',
  description: '',
  enabled: true
};

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
  const { message } = AntApp.useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const activePath = normalizePath(location.pathname);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [skins, setSkins] = useState([]);
  const [players, setPlayers] = useState([]);
  const [games, setGames] = useState([]);
  const [models, setModels] = useState([]);
  const [voices, setVoices] = useState([]);
  const [settings, setSettings] = useState({});
  const [werewolfModes, setWerewolfModes] = useState([]);
  const [werewolfRoles, setWerewolfRoles] = useState([]);
  const [gameDetail, setGameDetail] = useState(null);

  useEffect(() => {
    loadForPath(activePath);
  }, [activePath]);

  async function loadForPath(path = activePath) {
    setLoading(true);
    try {
      if (path === '/dashboard') {
        setStats(await adminRequest('/stats'));
      } else if (path.endsWith('/history')) {
        const gameType = path.includes('/debate/') ? 'debate' : path.includes('/werewolf/') ? 'werewolf' : 'consensus';
        setGames(await adminRequest(`/games?gameType=${gameType}`));
      } else if (path === '/players') {
        const [nextPlayers, nextModels, nextVoices, nextSettings] = await Promise.all([adminRequest('/players'), adminRequest('/models'), adminRequest('/voice-packages'), adminRequest('/settings')]);
        setPlayers(nextPlayers);
        setModels(nextModels);
        setVoices(nextVoices);
        setSettings(nextSettings || {});
      } else if (path === '/models') {
        setModels(await adminRequest('/models'));
      } else if (path === '/voices') {
        setVoices(await adminRequest('/voice-packages'));
      } else if (path === '/werewolf/roles') {
        setWerewolfRoles(await adminRequest('/werewolf-roles'));
      } else if (path === '/werewolf/modes') {
        const [nextModes, nextRoles] = await Promise.all([adminRequest('/werewolf-modes'), adminRequest('/werewolf-roles')]);
        setWerewolfModes(nextModes);
        setWerewolfRoles(nextRoles);
      } else if (path === '/consensus/skins') {
        setSkins(await adminRequest('/skins'));
      }
    } catch (error) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function refreshAll() {
    await loadForPath(activePath);
  }

  async function openGame(id) {
    setGameDetail(await adminRequest(`/games/${id}`));
  }

  async function deleteGame(id) {
    await adminRequest(`/games/${id}`, { method: 'DELETE' });
    setGameDetail(null);
    message.success('已删除对局');
    await loadForPath(activePath);
  }

  const context = {
    stats,
    skins,
    players,
    games,
    models,
    voices,
    werewolfModes,
    werewolfRoles,
    loading,
    refreshAll,
    openGame,
    deleteGame
  };

  return (
    <Layout className="admin-layout">
      <Sider width={244} className="admin-sider">
        <a className="admin-brand" href="/">
          <span>CONSENSUS</span>
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
          <Space>
            <Tag color="blue">本地管理</Tag>
            <Button onClick={refreshAll}>刷新</Button>
          </Space>
        </Header>
        <Content className="admin-content">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard {...context} />} />
            <Route path="/debate/history" element={<GameHistory gameType="debate" {...context} />} />
            <Route path="/werewolf/history" element={<GameHistory gameType="werewolf" {...context} />} />
            <Route path="/werewolf/roles" element={<WerewolfRoleManager roles={werewolfRoles} onRefresh={refreshAll} />} />
            <Route path="/werewolf/modes" element={<WerewolfModeManager modes={werewolfModes} roles={werewolfRoles} onRefresh={refreshAll} />} />
            <Route path="/consensus/history" element={<GameHistory gameType="consensus" {...context} />} />
            <Route path="/consensus/skins" element={<SkinManager skins={skins} onRefresh={refreshAll} />} />
            <Route path="/players" element={<PlayerManager players={players} models={models} voices={voices} settings={settings} onRefresh={refreshAll} />} />
            <Route path="/models" element={<ModelManager models={models} onRefresh={refreshAll} />} />
            <Route path="/voices" element={<VoiceManager voices={voices} onRefresh={refreshAll} />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Content>
      </Layout>
      <GameDetailDrawer game={gameDetail} modes={werewolfModes} onClose={() => setGameDetail(null)} onDelete={deleteGame} />
    </Layout>
  );
}

function Dashboard({ stats }) {
  return (
    <Space direction="vertical" size={16} className="admin-full">
      <div className="admin-stat-grid">
        <Card><Statistic title="对局" value={stats?.games || 0} /></Card>
        <Card><Statistic title="玩家" value={stats?.players || 0} /></Card>
        <Card><Statistic title="模型" value={stats?.models || 0} /></Card>
        <Card><Statistic title="语音包" value={stats?.voicePackages || 0} /></Card>
        <Card><Statistic title="启用皮肤" value={stats?.enabledSkins || 0} /></Card>
      </div>
    </Space>
  );
}

function GameHistory({ gameType, games, loading, openGame, deleteGame, refreshAll, werewolfModes }) {
  const [importing, setImporting] = useState(false);
  const [filters, setFilters] = useState({});
  const [preloadTask, setPreloadTask] = useState(null);
  const gamePool = games.filter((game) => game.gameType === gameType);
  const filtered = filterByQuery(
    gamePool
      .filter((game) => !filters.mode || game.mode === filters.mode)
      .filter((game) => !filters.winner || game.winner === filters.winner),
    filters.q,
    [(game) => game.id, getGameTitle, (game) => formatGameMode(game.mode, game, werewolfModes), (game) => formatWinner(game.winner), (game) => formatTime(game.createdAt)]
  );
  return (
    <>
      <Card
        title={`${GAME_LABELS[gameType]}历史`}
        extra={<Button type="primary" icon={<CloudUploadOutlined />} onClick={() => setImporting(true)}>导入对局</Button>}
      >
        <ListFilterBar
          value={filters}
          onChange={setFilters}
          searchPlaceholder="搜索主题、模式、胜负、时间"
          selects={[
            { key: 'mode', placeholder: '模式', options: uniqueOptions(gamePool.map((game) => game.mode), (value) => formatGameMode(value, { gameType }, werewolfModes)) },
            { key: 'winner', placeholder: '胜负', options: uniqueOptions(gamePool.map((game) => game.winner), formatWinner) }
          ]}
        />
        <GameTable games={filtered} loading={loading} onOpen={openGame} onDelete={deleteGame} onPreload={setPreloadTask} modes={werewolfModes} />
      </Card>
      <ImportGameModal open={importing} gameType={gameType} onCancel={() => setImporting(false)} onImported={async () => {
        setImporting(false);
        await refreshAll();
      }} />
      <ResourcePreloadModal task={preloadTask} onClose={() => setPreloadTask(null)} />
    </>
  );
}

function ImportGameModal({ open, gameType, onCancel, onImported }) {
  const { message } = AntApp.useApp();
  const [raw, setRaw] = useState('');
  const [template, setTemplate] = useState(null);
  const [promptPlayers, setPromptPlayers] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const generationPrompt = useMemo(() => buildImportGenerationPrompt(gameType, promptPlayers), [gameType, promptPlayers]);

  useEffect(() => {
    if (!open) {
      setRaw('');
      setTemplate(null);
      setPromptPlayers([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    adminRequest('/players')
      .then((items) => {
        if (!cancelled) setPromptPlayers(items || []);
      })
      .catch(() => {
        if (!cancelled) setPromptPlayers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function submit() {
    setSubmitting(true);
    setTemplate(null);
    try {
      await adminRequest('/games/import', { method: 'POST', body: JSON.stringify({ gameType, raw }) });
      message.success('导入成功，已写入对局历史');
      await onImported();
    } catch (error) {
      setTemplate(error.template || null);
      message.error(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function beforeUpload(file) {
    setRaw(await file.text());
    setTemplate(null);
    return false;
  }

  return (
    <Modal
      open={open}
      width={820}
      title={`导入${GAME_LABELS[gameType]}对局`}
      onCancel={onCancel}
      onOk={submit}
      okText="校验并导入"
      okButtonProps={{ disabled: !raw.trim(), loading: submitting }}
      destroyOnHidden
    >
      <Space direction="vertical" size={12} className="admin-full">
        <Upload accept=".json,application/json" showUploadList={false} beforeUpload={beforeUpload}>
          <Button icon={<CloudUploadOutlined />}>选择 JSON 文件</Button>
        </Upload>
        <Card size="small" title="AI 生成提示词">
          <Space direction="vertical" size={8} className="admin-full">
            <Text type="secondary">复制下面提示词给 AI，可快速生成符合规则和流程的 JSON 对局。</Text>
            <Input.TextArea rows={8} value={generationPrompt} readOnly />
            <Space>
              <Button onClick={() => copyText(generationPrompt, message)}>复制提示词</Button>
            </Space>
          </Space>
        </Card>
        <Input.TextArea rows={12} value={raw} onChange={(event) => setRaw(event.target.value)} placeholder="粘贴 JSON 对局内容" />
        {template && <pre className="admin-json-template">{JSON.stringify(template, null, 2)}</pre>}
      </Space>
    </Modal>
  );
}

function GameTable({ games, loading, onOpen, onDelete, onPreload, modes = [] }) {
  const { message } = AntApp.useApp();
  async function preload(record) {
    try {
      const task = await adminRequest(`/games/${record.id}/preload-resources`, { method: 'POST', body: JSON.stringify({}) });
      onPreload?.(task);
    } catch (error) {
      message.error(error.message);
    }
  }
  return (
    <Table
      rowKey="id"
      loading={loading}
      dataSource={games}
      pagination={{ pageSize: 10 }}
      columns={[
        { title: '类型', dataIndex: 'gameType', render: (value) => GAME_LABELS[value] || value },
        { title: '模式', dataIndex: 'mode', render: (value, record) => formatGameMode(value, record, modes) },
        { title: '主题', ellipsis: true, render: (_, record) => getGameTitle(record) },
        { title: '胜负', dataIndex: 'winner', render: formatWinner },
        { title: '时间', dataIndex: 'createdAt', render: formatTime },
        {
          title: '操作',
          width: 260,
          render: (_, record) => (
            <Space>
              {record.mode === 'imported' && (
                <Button size="small" icon={<CloudUploadOutlined />} onClick={() => preload(record)}>
                  资源预加载
                </Button>
              )}
              <TableActions
              onEdit={() => onOpen?.(record.id)}
              editText="详情"
              onDelete={onDelete ? () => onDelete(record.id) : null}
              />
            </Space>
          )
        }
      ]}
    />
  );
}

function ResourcePreloadModal({ task, onClose }) {
  const [current, setCurrent] = useState(task);

  useEffect(() => {
    setCurrent(task);
    if (!task?.id || task.status !== 'running') return undefined;
    const timer = window.setInterval(async () => {
      try {
        const next = await adminRequest(`/resource-preload-tasks/${task.id}`);
        setCurrent(next);
        if (next.status !== 'running') window.clearInterval(timer);
      } catch {
        window.clearInterval(timer);
      }
    }, 1200);
    return () => window.clearInterval(timer);
  }, [task]);

  if (!current) return null;
  const running = current.status === 'running';

  return (
    <Modal
      open
      title="资源预加载"
      onCancel={running ? undefined : onClose}
      footer={running ? null : <Button onClick={onClose}>关闭</Button>}
      closable={!running}
      destroyOnHidden
    >
      <Space direction="vertical" size={10} className="admin-full">
        <Text>{running ? '正在后台预生成游戏资源...' : '资源预加载任务已结束。'}</Text>
        <Text>进度：{current.done || 0} / {current.total || 0}</Text>
        <Text>生成：{current.generated || 0}，缓存命中：{current.cached || 0}，跳过：{current.skipped || 0}，失败：{current.failed || 0}</Text>
        {current.error && <Text type="danger">{current.error}</Text>}
      </Space>
    </Modal>
  );
}

function buildImportGenerationPrompt(gameType, players = []) {
  const playerLines = players.map((player) => [
    `id=${player.id}`,
    `昵称=${player.nickname || player.name || ''}`,
    `性别=${player.sex || '未知'}`,
    `人格=${player.personality || '未配置'}`,
    `模型=${player.model || player.modelName || player.modelId || '未绑定'}`,
    `语音包=${player.voicePackageId || '未绑定'}`
  ].join('；')).join('\n');
  const rule = getImportPromptRule(gameType);
  const flowPrompt = getImportPromptFlowRequirements(gameType);
  return [
    `你是一个严谨的 AI 对局 JSON 生成器。请生成一份可直接导入后台的 ${GAME_LABELS[gameType] || gameType} 对局 JSON。`,
    '',
    '硬性要求：',
    '1. 只输出 JSON，不要输出 Markdown、解释或代码块。',
    '2. 必须使用下面玩家池中的真实 id 和昵称，不要虚构玩家。',
    '3. 每位玩家的发言要符合其人格，流程要完整，结果要自洽。',
    '4. 每条发言建议包含 playerId、text；如果有思考过程，可额外提供 thinking 字段。',
    '5. 时间、胜负、MVP/关键角色等结果必须能从流程中看出原因。',
    '',
    '游戏规则与目标结构：',
    rule,
    '',
    '流程与字数要求：',
    flowPrompt,
    '',
    '可用玩家池：',
    playerLines || '暂无玩家，请先在玩家管理中配置玩家。',
    '',
    '现在请生成完整 JSON。'
  ].join('\n');
}

function getImportPromptRule(gameType) {
  if (gameType === 'debate') {
    return [
      '- type 固定为 "debate" 或 "ai_debate_match"。',
      '- 必须包含 topic.title、topic.proPosition、topic.conPosition。',
      '- players 至少包含正方 4 人、反方 4 人，可包含评委；每人包含 id、nickname、side(pro/con/judge)、sideIndex。',
      '- phases 或 rounds 要覆盖开场/立论/攻辩/自由辩/总结/评委点评/结果等流程。',
      '- speeches 中 playerId 必须对应 players 中的人，text 要有明确论点和反驳。',
      '- result/winner/mvp/winReason 要和发言表现一致。'
    ].join('\n');
  }
  if (gameType === 'werewolf') {
    return [
      '- type 固定为 "werewolf"。',
      '- 必须包含 gameId 或 id、mode、players、rounds。',
      '- players 需要包含 id、nickname、role、camp/alignment，角色和阵营要自洽。',
      '- rounds 要覆盖夜晚行动、白天发言、投票、遗言、胜负结算。',
      '- 发言、投票和死亡结果要能解释最终 winner。'
    ].join('\n');
  }
  return [
    '- type 固定为 "consensus"。',
    '- 必须包含 event 或 skin 信息、players、rounds。',
    '- rounds 要包含问题、投票、线索/噪音、玩家发言和最终结算。',
    '- 玩家发言要围绕皮肤真相、线索和迷雾噪音推进。',
    '- winner/winReason 要与投票和线索结果一致。'
  ].join('\n');
}

function getImportPromptFlowRequirements(gameType) {
  const common = [
    '- 所有玩家发言 text 建议 80-180 个中文字符，关键总结/评委点评/遗言/结算说明建议 120-240 个中文字符。',
    '- thinking 如提供，控制在 30-80 个中文字符，只写该角色当下判断，不泄露非本角色应知道的信息。',
    '- 流程必须按真实游戏顺序推进，事件数量要足够支撑胜负、MVP、阵营立场或最终结论。'
  ];
  if (gameType === 'debate') {
    return [
      ...common,
      '- 辩论赛至少包含开场、立论、攻辩/质询、自由辩、总结陈词、评委点评、最终结果。',
      '- 正反方 1-4 辩每人至少 1 次有效发言，评委点评要引用具体表现。'
    ].join('\n');
  }
  if (gameType === 'werewolf') {
    return [
      ...common,
      '- 狼人杀至少包含夜晚行动、白天发言、投票、遗言、胜负结算，建议不少于 2 个昼夜轮次。',
      '- 每轮发言、投票理由和死亡结果要能解释最终阵营胜负。'
    ].join('\n');
  }
  return [
    ...common,
    '- 共识迷雾至少包含 3 轮调查：每轮问题、匿名投票、线索/噪音揭示、玩家讨论、阶段判断。',
    '- 玩家发言要围绕皮肤真相、线索、噪音和个人记忆推进，不要只给结论。'
  ].join('\n');
}

async function copyText(text, messageApi) {
  try {
    await navigator.clipboard.writeText(text);
    messageApi.success('提示词已复制');
  } catch {
    messageApi.error('复制失败，请手动选择文本复制');
  }
}

function ListFilterBar({ value = {}, onChange, searchPlaceholder = '搜索', selects = [] }) {
  const update = (patch) => onChange?.({ ...value, ...patch });
  return (
    <Space wrap className="admin-list-filters">
      <Input.Search
        allowClear
        value={value.q || ''}
        placeholder={searchPlaceholder}
        onChange={(event) => update({ q: event.target.value })}
        style={{ width: 260 }}
      />
      {selects.map((item) => (
        <Select
          key={item.key}
          allowClear
          value={value[item.key]}
          placeholder={item.placeholder}
          options={item.options}
          onChange={(next) => update({ [item.key]: next })}
          style={{ width: item.width || 160 }}
        />
      ))}
    </Space>
  );
}

function ModelManager({ models, onRefresh }) {
  const { message } = AntApp.useApp();
  const [editing, setEditing] = useState(null);
  const [testingId, setTestingId] = useState(null);
  const [filters, setFilters] = useState({});
  const filteredModels = filterByQuery(
    models
      .filter((model) => !filters.provider || model.provider === filters.provider)
      .filter((model) => !filters.apiFormat || model.apiFormat === filters.apiFormat)
      .filter((model) => filters.enabled === undefined || model.enabled === filters.enabled),
    filters.q,
    ['provider', 'name', 'baseUrl', (model) => formatApiFormat(model.apiFormat)]
  );

  async function save(values) {
    const path = editing?.id ? `/models/${editing.id}` : '/models';
    const method = editing?.id ? 'PUT' : 'POST';
    await adminRequest(path, { method, body: JSON.stringify(values) });
    message.success('模型已保存');
    setEditing(null);
    await onRefresh();
  }

  async function remove(id) {
    await adminRequest(`/models/${id}`, { method: 'DELETE' });
    message.success('模型已删除');
    await onRefresh();
  }

  async function editModel(record) {
    try {
      const detail = await adminRequest(`/models/${record.id}`);
      setEditing(detail);
    } catch (error) {
      message.error(error.message);
    }
  }

  async function testModel(record) {
    setTestingId(record.id);
    try {
      const result = await adminRequest(`/models/${record.id}/test`, { method: 'POST', body: JSON.stringify({}) });
      if (result.ok) message.success(`连接成功：${result.latencyMs || 0}ms，${result.message || '模型可用'}`);
      else message.error(`连接失败：${result.message}`);
    } catch (error) {
      message.error(error.message);
    } finally {
      setTestingId(null);
    }
  }

  return (
    <>
      <Card title="模型列表" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({})}>新增模型</Button>}>
        <ListFilterBar
          value={filters}
          onChange={setFilters}
          searchPlaceholder="搜索供应商、模型、Base URL"
          selects={[
            { key: 'provider', placeholder: '供应商', options: uniqueOptions(models.map((model) => model.provider)) },
            { key: 'apiFormat', placeholder: '接口格式', options: API_FORMAT_OPTIONS },
            { key: 'enabled', placeholder: '状态', options: booleanOptions() }
          ]}
        />
        <Table rowKey="id" dataSource={filteredModels} columns={[
          { title: '供应商', dataIndex: 'provider' },
          { title: '模型名称', dataIndex: 'name' },
          { title: 'Base URL', dataIndex: 'baseUrl', ellipsis: true },
          { title: '接口格式', dataIndex: 'apiFormat', render: formatApiFormat },
          { title: 'API Key', dataIndex: 'hasApiKey', render: (value) => <Tag color={value ? 'green' : 'default'}>{value ? '已配置' : '未配置'}</Tag> },
          { title: '启用', dataIndex: 'enabled', render: enabledTag },
          {
            title: '操作',
            width: 240,
            render: (_, record) => (
              <Space>
                <Button size="small" icon={<ApiOutlined />} loading={testingId === record.id} onClick={() => testModel(record)}>测试</Button>
                <TableActions onEdit={() => editModel(record)} onDelete={() => remove(record.id)} />
              </Space>
            )
          }
        ]} />
      </Card>
      <ModelModal open={editing !== null} initialValues={editing} onCancel={() => setEditing(null)} onSave={save} />
    </>
  );
}

function PlayerManager({ players, models, voices, settings = {}, onRefresh }) {
  const { message } = AntApp.useApp();
  const [editing, setEditing] = useState(null);
  const [debugging, setDebugging] = useState(null);
  const [filters, setFilters] = useState({});
  const modelOptions = models.map((model) => ({ value: model.id, label: `${model.provider}/${model.name}` }));
  const voiceOptions = voices.map((voice) => ({ value: voice.id, label: voice.name }));
  const hostOptions = [
    { value: 0, label: '系统默认主持人' },
    ...players.filter((player) => player.enabled).map((player) => ({ value: Number(player.id), label: `${player.id} · ${player.nickname || player.name}` }))
  ];
  const filteredPlayers = filterByQuery(
    players
      .filter((player) => !filters.sex || player.sex === filters.sex)
      .filter((player) => !filters.modelId || player.modelId === filters.modelId)
      .filter((player) => !filters.voicePackageId || player.voicePackageId === filters.voicePackageId)
      .filter((player) => filters.enabled === undefined || player.enabled === filters.enabled),
    filters.q,
    ['nickname', 'name', 'sex', 'personality', (player) => modelName(player, models), (player) => voices.find((voice) => voice.id === player.voicePackageId)?.name]
  );

  async function save(values) {
    const payload = {
      ...values,
      provider: '',
      model: ''
    };
    const path = editing?.id ? `/players/${editing.id}` : '/players';
    const method = editing?.id ? 'PUT' : 'POST';
    await adminRequest(path, { method, body: JSON.stringify(payload) });
    message.success('玩家已保存');
    setEditing(null);
    await onRefresh();
  }

  async function toggle(player) {
    await adminRequest(`/players/${player.id}/enabled`, { method: 'PATCH', body: JSON.stringify({ enabled: !player.enabled }) });
    await onRefresh();
  }

  async function saveDefaultHost(playerId) {
    await adminRequest('/settings/default-host', { method: 'PUT', body: JSON.stringify({ playerId: Number(playerId) || null }) });
    message.success('默认主持人已更新');
    await onRefresh();
  }

  function confirmRemove(player) {
    Modal.confirm({
      title: '删除玩家',
      content: `确认删除「${player.nickname || player.name || player.id}」吗？已被历史对局引用的玩家不能删除。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      async onOk() {
        await adminRequest(`/players/${player.id}`, { method: 'DELETE' });
        message.success('玩家已删除');
        await onRefresh();
      }
    });
  }

  return (
    <>
      <Card
        title="玩家列表"
        extra={
          <Space>
            <Text>默认主持人</Text>
            <Select
              style={{ width: 260 }}
              value={Number(settings.defaultHostPlayerId) || 0}
              options={hostOptions}
              onChange={saveDefaultHost}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({})}>新增玩家</Button>
          </Space>
        }
      >
        <ListFilterBar
          value={filters}
          onChange={setFilters}
          searchPlaceholder="搜索昵称、人格、模型、语音包"
          selects={[
            { key: 'sex', placeholder: '性别', options: uniqueOptions(players.map((player) => player.sex)) },
            { key: 'modelId', placeholder: '模型', options: modelOptions },
            { key: 'voicePackageId', placeholder: '语音包', options: voiceOptions },
            { key: 'enabled', placeholder: '状态', options: booleanOptions() }
          ]}
        />
        <Table rowKey="id" dataSource={filteredPlayers} columns={[
          { title: '头像', dataIndex: 'avatar', width: 72, render: (value) => <Avatar src={value} icon={<UserOutlined />} /> },
          { title: '昵称', width: 120, dataIndex: 'nickname' },
          { title: '性别', width: 80, dataIndex: 'sex', render: (value) => value || '-' },
          { title: '模型', width: 250, dataIndex: 'model', render: (_, record) => modelName(record, models) },
          { title: '人格', dataIndex: 'personality', ellipsis: true },
          { title: '语音包', width: 200, dataIndex: 'voicePackageId', render: (value) => voices.find((voice) => voice.id === value)?.name || '-' },
          { title: '状态', width: 100, dataIndex: 'enabled', render: enabledTag },
          {
            title: '操作',
            width: 300,
            render: (_, record) => (
              <Space>
                <Button size="small" icon={<MessageOutlined />} onClick={() => setDebugging(record)}>调试</Button>
                <Button size="small" onClick={() => toggle(record)}>{record.enabled ? '停用' : '启用'}</Button>
                <TableActions onEdit={() => setEditing(record)} onDelete={() => confirmRemove(record)} />
              </Space>
            )
          }
        ]} />
      </Card>
      <PlayerModal open={editing !== null} initialValues={editing} modelOptions={modelOptions} voiceOptions={voiceOptions} onCancel={() => setEditing(null)} onSave={save} />
      <PlayerDebugModal
        open={Boolean(debugging)}
        player={debugging}
        models={models}
        voices={voices}
        onCancel={() => setDebugging(null)}
      />
    </>
  );
}

function VoiceManager({ voices, onRefresh }) {
  const { message } = AntApp.useApp();
  const [editing, setEditing] = useState(null);
  const [playingId, setPlayingId] = useState(null);
  const [filters, setFilters] = useState({});
  const audioRef = useRef(null);
  const filteredVoices = filterByQuery(
    voices
      .filter((voice) => !filters.provider || voice.provider === filters.provider)
      .filter((voice) => !filters.language || voice.language === filters.language)
      .filter((voice) => !filters.gender || voice.gender === filters.gender)
      .filter((voice) => filters.enabled === undefined || voice.enabled === filters.enabled),
    filters.q,
    ['name', 'provider', 'voiceId', 'language', 'gender', 'style', 'description']
  );

  async function save(values) {
    const path = editing?.id ? `/voice-packages/${editing.id}` : '/voice-packages';
    const method = editing?.id ? 'PUT' : 'POST';
    await adminRequest(path, { method, body: JSON.stringify(values) });
    message.success('语音包已保存');
    setEditing(null);
    await onRefresh();
  }

  async function remove(id) {
    await adminRequest(`/voice-packages/${id}`, { method: 'DELETE' });
    message.success('语音包已删除');
    await onRefresh();
  }

  async function playVoice(voice, text) {
    setPlayingId(voice.id);
    try {
      await playVoicePackage(voice, text || voice.sampleText, audioRef);
      message.success('已开始试听');
    } catch (error) {
      message.error(error.message);
    } finally {
      setPlayingId(null);
    }
  }

  return (
    <>
      <Card title="语音列表" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({})}>新增语音包</Button>}>
        <ListFilterBar
          value={filters}
          onChange={setFilters}
          searchPlaceholder="搜索名称、Voice ID、风格、说明"
          selects={[
            { key: 'provider', placeholder: '供应商', options: uniqueOptions(voices.map((voice) => voice.provider), formatVoiceProvider) },
            { key: 'language', placeholder: '语言', options: uniqueOptions(voices.map((voice) => voice.language)) },
            { key: 'gender', placeholder: '性别', options: uniqueOptions(voices.map((voice) => voice.gender)) },
            { key: 'enabled', placeholder: '状态', options: booleanOptions() }
          ]}
        />
        <Table rowKey="id" dataSource={filteredVoices} columns={[
          { title: '名称', dataIndex: 'name' },
          { title: '供应商', dataIndex: 'provider', render: formatVoiceProvider },
          { title: 'Voice ID', dataIndex: 'voiceId', render: (value) => value || '-' },
          { title: '语言', dataIndex: 'language', render: (value) => value || '-' },
          { title: '性别', dataIndex: 'gender', render: (value) => value || '-' },
          { title: '说明', dataIndex: 'description', ellipsis: true },
          { title: '启用', dataIndex: 'enabled', render: enabledTag },
          {
            title: '操作',
            width: 300,
            render: (_, record) => (
              <Space>
                <Button size="small" icon={<PlayCircleOutlined />} loading={playingId === record.id} onClick={() => playVoice(record)}>试听</Button>
                <TableActions onEdit={() => setEditing(record)} onDelete={() => remove(record.id)} />
              </Space>
            )
          }
        ]} />
      </Card>
      <audio ref={audioRef} hidden />
      <VoiceModal open={editing !== null} initialValues={editing} onCancel={() => setEditing(null)} onSave={save} />
    </>
  );
}

const WEREWOLF_FACTION_OPTIONS = [
  { value: 'good', label: '好人阵营' },
  { value: 'wolves', label: '狼人阵营' }
];

const WEREWOLF_ROLE_TYPE_OPTIONS = [
  { value: 'wolf', label: '狼人' },
  { value: 'god', label: '神职' },
  { value: 'villager', label: '平民' }
];

const WEREWOLF_WIN_OPTIONS = [
  { value: 'side', label: '屠边局' },
  { value: 'gods', label: '屠神局' },
  { value: 'villagers', label: '屠民局' },
  { value: 'all', label: '屠城局' }
];

function WerewolfRoleManager({ roles, onRefresh }) {
  const { message } = AntApp.useApp();
  const [editing, setEditing] = useState(null);
  const [filters, setFilters] = useState({});
  const filteredRoles = filterByQuery(
    roles.filter((role) => filters.enabled === undefined || role.enabled === filters.enabled),
    filters.q,
    ['id', 'name', 'responsibility', 'ability', 'keyInfo']
  );

  async function save(values) {
    const payload = {
      ...values,
      rule: parseJsonField(values.rule, {})
    };
    const path = editing?.id ? `/werewolf-roles/${editing.id}` : '/werewolf-roles';
    const method = editing?.id ? 'PUT' : 'POST';
    await adminRequest(path, { method, body: JSON.stringify(payload) });
    message.success('角色已保存');
    setEditing(null);
    await onRefresh();
  }

  async function remove(id) {
    await adminRequest(`/werewolf-roles/${id}`, { method: 'DELETE' });
    message.success('角色已删除');
    await onRefresh();
  }

  return (
    <>
      <Card title="狼人杀角色" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({})}>新增角色</Button>}>
        <ListFilterBar
          value={filters}
          onChange={setFilters}
          searchPlaceholder="搜索角色、职责、能力"
          selects={[{ key: 'enabled', placeholder: '状态', options: booleanOptions() }]}
        />
        <Table rowKey="id" dataSource={filteredRoles} columns={[
          { title: '角色', dataIndex: 'name', render: (value, record) => <Space><strong>{value}</strong><Text type="secondary">{record.id}</Text></Space> },
          { title: '阵营', dataIndex: 'faction', render: (value) => value === 'wolves' ? <Tag color="red">狼人</Tag> : <Tag color="blue">好人</Tag> },
          { title: '类型', dataIndex: 'roleType', render: (value) => WEREWOLF_ROLE_TYPE_OPTIONS.find((item) => item.value === value)?.label || value },
          { title: '能力', dataIndex: 'ability', ellipsis: true },
          { title: '启用', dataIndex: 'enabled', render: enabledTag },
          { title: '操作', width: 150, render: (_, record) => <TableActions onEdit={() => setEditing(record)} onDelete={() => remove(record.id)} /> }
        ]} />
      </Card>
      <WerewolfRoleModal open={editing !== null} initialValues={editing} onCancel={() => setEditing(null)} onSave={save} />
    </>
  );
}

function WerewolfModeManager({ modes, roles, onRefresh }) {
  const { message } = AntApp.useApp();
  const [editing, setEditing] = useState(null);
  const [filters, setFilters] = useState({});
  const filteredModes = filterByQuery(
    modes.filter((mode) => filters.enabled === undefined || mode.enabled === filters.enabled),
    filters.q,
    ['id', 'name', 'description']
  );

  async function save(values) {
    const path = editing?.id ? `/werewolf-modes/${editing.id}` : '/werewolf-modes';
    const method = editing?.id ? 'PUT' : 'POST';
    await adminRequest(path, { method, body: JSON.stringify(values) });
    message.success('模式已保存');
    setEditing(null);
    await onRefresh();
  }

  async function remove(id) {
    await adminRequest(`/werewolf-modes/${id}`, { method: 'DELETE' });
    message.success('模式已删除');
    await onRefresh();
  }

  return (
    <>
      <Card title="狼人杀模式" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({ roles: [], sheriff: { enabled: true, firstDayElection: true, voteWeight: 1.5 }, winCondition: 'side' })}>新增模式</Button>}>
        <ListFilterBar
          value={filters}
          onChange={setFilters}
          searchPlaceholder="搜索模式、说明"
          selects={[{ key: 'enabled', placeholder: '状态', options: booleanOptions() }]}
        />
        <Table rowKey="id" dataSource={filteredModes} columns={[
          { title: '模式', dataIndex: 'name' },
          { title: '人数', dataIndex: 'playerCount', width: 90 },
          { title: '胜利条件', dataIndex: 'winCondition', render: (value) => WEREWOLF_WIN_OPTIONS.find((item) => item.value === value)?.label || value },
          { title: '阵容', dataIndex: 'roles', render: (items = []) => summarizeWerewolfRoles(items, roles) },
          { title: '说明', dataIndex: 'description', ellipsis: true },
          { title: '启用', dataIndex: 'enabled', render: enabledTag },
          { title: '操作', width: 150, render: (_, record) => <TableActions onEdit={() => setEditing(record)} onDelete={() => remove(record.id)} /> }
        ]} />
      </Card>
      <WerewolfModeModal open={editing !== null} initialValues={editing} roles={roles} onCancel={() => setEditing(null)} onSave={save} />
    </>
  );
}

function SkinManager({ skins, onRefresh }) {
  const { message } = AntApp.useApp();
  const [editing, setEditing] = useState(null);
  const [importing, setImporting] = useState(false);
  const [filters, setFilters] = useState({});
  const filteredSkins = filterByQuery(
    skins
      .filter((skin) => !filters.source || skin.source === filters.source)
      .filter((skin) => filters.enabled === undefined || skin.enabled === filters.enabled),
    filters.q,
    ['id', 'name', 'version', 'source', 'background', 'truth']
  );

  async function save(values) {
    const payload = {
      ...values,
      terms: parseJsonField(values.terms, {}),
      clues: parseJsonField(values.clues, []),
      noises: parseJsonField(values.noises, []),
      memoryExamples: parseJsonField(values.memoryExamples, [])
    };
    const path = editing?.id ? `/skins/${editing.id}` : '/skins';
    const method = editing?.id ? 'PUT' : 'POST';
    await adminRequest(path, { method, body: JSON.stringify(payload) });
    message.success('皮肤已保存');
    setEditing(null);
    await onRefresh();
  }

  async function remove(id) {
    await adminRequest(`/skins/${id}`, { method: 'DELETE' });
    message.success('皮肤已删除');
    await onRefresh();
  }

  return (
    <>
      <Card
        title="皮肤管理"
        extra={(
          <Space>
            <Button icon={<CloudUploadOutlined />} onClick={() => setImporting(true)}>导入 JSON</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({})}>新增皮肤</Button>
          </Space>
        )}
      >
        <ListFilterBar
          value={filters}
          onChange={setFilters}
          searchPlaceholder="搜索皮肤、背景、真相"
          selects={[
            { key: 'source', placeholder: '来源', options: uniqueOptions(skins.map((skin) => skin.source)) },
            { key: 'enabled', placeholder: '状态', options: booleanOptions() }
          ]}
        />
        <Table rowKey="id" dataSource={filteredSkins} columns={[
          { title: '名称', dataIndex: 'name' },
          { title: '版本', dataIndex: 'version' },
          { title: '来源', dataIndex: 'source' },
          { title: '启用', dataIndex: 'enabled', render: enabledTag },
          { title: '操作', width: 150, render: (_, record) => <TableActions onEdit={() => setEditing(record)} onDelete={() => remove(record.id)} /> }
        ]} />
      </Card>
      <SkinModal open={editing !== null} initialValues={editing} onCancel={() => setEditing(null)} onSave={save} />
      <ImportSkinModal open={importing} onCancel={() => setImporting(false)} onImported={async () => {
        setImporting(false);
        message.success('皮肤导入成功');
        await onRefresh();
      }} />
    </>
  );
}

function ModelModal({ open, initialValues, onCancel, onSave }) {
  const apiFormat = initialValues?.apiFormat === 'anthropic-compatible' ? 'anthropic-compatible' : 'openai-compatible';
  return (
    <EntityModal open={open} title={initialValues?.id ? '编辑模型' : '新增模型'} initialValues={{ apiFormat, enabled: true, ...initialValues }} onCancel={onCancel} onSave={onSave}>
      <Form.Item name="provider" label="供应商" rules={[{ required: true, message: '请输入供应商' }]}><Input /></Form.Item>
      <Form.Item name="name" label="模型名称" rules={[{ required: true, message: '请输入模型名称' }]}><Input /></Form.Item>
      <Form.Item
        name="baseUrl"
        label="Base URL"
        extra="支持 ${ENV_NAME} 模板变量。Cloudflare Workers AI 示例：https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/v1"
      >
        <Input />
      </Form.Item>
      <Form.Item name="apiKey" label="API Key"><Input autoComplete="new-password" /></Form.Item>
      <Form.Item name="apiFormat" label="接口格式"><Select options={API_FORMAT_OPTIONS} /></Form.Item>
      <Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item>
    </EntityModal>
  );
}

function PlayerModal({ open, initialValues, modelOptions, voiceOptions, onCancel, onSave }) {
  return (
    <EntityModal open={open} title={initialValues?.id ? '编辑玩家' : '新增玩家'} initialValues={{ ...emptyPlayer, ...(initialValues || {}) }} onCancel={onCancel} onSave={onSave}>
      <Form.Item name="nickname" label="昵称" rules={[{ required: true, message: '请输入昵称' }]}><Input /></Form.Item>
      <Form.Item name="avatar" label="头像"><AvatarUpload /></Form.Item>
      <Form.Item name="sex" label="性别"><Select options={['未知', '男', '女'].map((value) => ({ value, label: value }))} /></Form.Item>
      <Form.Item name="modelId" label="模型"><Select allowClear options={modelOptions} /></Form.Item>
      <Form.Item name="personality" label="人格"><Input.TextArea rows={4} /></Form.Item>
      <Form.Item name="voicePackageId" label="语音包"><Select allowClear options={voiceOptions} /></Form.Item>
      <Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item>
    </EntityModal>
  );
}

function WerewolfRoleModal({ open, initialValues, onCancel, onSave }) {
  const values = {
    faction: 'good',
    roleType: 'villager',
    enabled: true,
    rule: JSON.stringify({ actions: [] }, null, 2),
    ...(initialValues || {})
  };
  if (typeof values.rule !== 'string') values.rule = JSON.stringify(values.rule || { actions: [] }, null, 2);
  return (
    <EntityModal open={open} width={760} title={initialValues?.id ? '编辑角色' : '新增角色'} initialValues={values} onCancel={onCancel} onSave={onSave}>
      <Form.Item name="id" label="角色 ID" rules={[{ required: true, message: '请输入角色 ID' }]}><Input disabled={Boolean(initialValues?.id)} /></Form.Item>
      <Form.Item name="name" label="角色名称" rules={[{ required: true, message: '请输入角色名称' }]}><Input /></Form.Item>
      <Form.Item name="faction" label="阵营"><Select options={WEREWOLF_FACTION_OPTIONS} /></Form.Item>
      <Form.Item name="roleType" label="角色类型"><Select options={WEREWOLF_ROLE_TYPE_OPTIONS} /></Form.Item>
      <Form.Item name="responsibility" label="责任"><Input.TextArea rows={2} /></Form.Item>
      <Form.Item name="ability" label="能力"><Input.TextArea rows={2} /></Form.Item>
      <Form.Item name="keyInfo" label="关键信息"><Input.TextArea rows={2} /></Form.Item>
      <Form.Item name="rule" label="规则 DSL JSON" extra="启用角色只允许 kill、inspectFaction、save、poison、guard、shootOnDeath、surviveExileOnce、voteOnly、speakOnly。"><Input.TextArea rows={8} /></Form.Item>
      <Form.Item name="sortOrder" label="排序"><InputNumber min={0} /></Form.Item>
      <Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item>
    </EntityModal>
  );
}

function VoiceModal({ open, initialValues, onCancel, onSave }) {
  return (
    <EntityModal open={open} title={initialValues?.id ? '编辑语音包' : '新增语音包'} initialValues={{ ...emptyVoice, ...(initialValues || {}) }} onCancel={onCancel} onSave={onSave}>
      <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}><Input /></Form.Item>
      <Form.Item name="provider" label="供应商">
        <Select options={[
          { value: 'browser', label: '浏览器本地语音' },
          { value: 'azure', label: 'Azure Speech' }
        ]} />
      </Form.Item>
      <Form.Item name="voiceId" label="Voice ID"><Input placeholder="如 zh-CN-XiaoxiaoNeural" /></Form.Item>
      <Form.Item name="language" label="语言"><Input placeholder="zh-CN" /></Form.Item>
      <Form.Item name="gender" label="性别"><Select allowClear options={['男', '女', '中性'].map((value) => ({ value, label: value }))} /></Form.Item>
      <Form.Item name="style" label="风格"><Input placeholder="如 cheerful、sad、angry，需目标语音支持" /></Form.Item>
      <Form.Item name="rate" label="语速"><Input placeholder="0%、+10%、-10%" /></Form.Item>
      <Form.Item name="pitch" label="音调"><Input placeholder="0%、+5%、-5%" /></Form.Item>
      <Form.Item name="temperature" label="语音温度"><Input type="number" min={0} max={2} step={0.1} /></Form.Item>
      <Form.Item name="sampleText" label="试听文本"><Input.TextArea rows={2} /></Form.Item>
      <Form.Item name="description" label="说明"><Input.TextArea rows={3} /></Form.Item>
      <Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item>
    </EntityModal>
  );
}

function WerewolfModeModal({ open, initialValues, roles = [], onCancel, onSave }) {
  const roleOptions = roles.filter((role) => role.enabled).map((role) => ({ value: role.id, label: `${role.name}（${role.id}）` }));
  const values = {
    enabled: true,
    winCondition: 'side',
    sheriff: { enabled: true, firstDayElection: true, voteWeight: 1.5 },
    roles: [],
    ...(initialValues || {})
  };
  return (
    <EntityModal open={open} width={860} title={initialValues?.id ? '编辑模式' : '新增模式'} initialValues={values} onCancel={onCancel} onSave={onSave}>
      <Form.Item name="id" label="模式 ID" rules={[{ required: true, message: '请输入模式 ID' }]}><Input disabled={Boolean(initialValues?.id)} /></Form.Item>
      <Form.Item name="name" label="模式名称" rules={[{ required: true, message: '请输入模式名称' }]}><Input /></Form.Item>
      <Form.Item name="description" label="说明"><Input.TextArea rows={4} /></Form.Item>
      <Form.Item name="winCondition" label="胜利条件"><Select options={WEREWOLF_WIN_OPTIONS} /></Form.Item>
      <Card size="small" title="角色阵容" className="admin-nested-card">
        <Form.List name="roles">
          {(fields, { add, remove }) => (
            <Space direction="vertical" style={{ width: '100%' }}>
              {fields.map((field) => (
                <Space key={field.key} align="baseline" wrap>
                  <Form.Item {...field} name={[field.name, 'roleId']} rules={[{ required: true, message: '请选择角色' }]}>
                    <Select style={{ width: 260 }} options={roleOptions} placeholder="选择角色" />
                  </Form.Item>
                  <Form.Item {...field} name={[field.name, 'count']} rules={[{ required: true, message: '请输入数量' }]}>
                    <InputNumber min={1} max={20} placeholder="数量" />
                  </Form.Item>
                  <Button danger onClick={() => remove(field.name)}>删除</Button>
                </Space>
              ))}
              <Button icon={<PlusOutlined />} onClick={() => add({ roleId: roleOptions[0]?.value, count: 1 })}>添加角色</Button>
            </Space>
          )}
        </Form.List>
      </Card>
      <Card size="small" title="警徽流" className="admin-nested-card">
        <Form.Item name={['sheriff', 'enabled']} label="启用警徽流" valuePropName="checked"><Switch /></Form.Item>
        <Form.Item name={['sheriff', 'firstDayElection']} label="首日竞选" valuePropName="checked"><Switch /></Form.Item>
        <Form.Item name={['sheriff', 'voteWeight']} label="警长票权重"><InputNumber min={1} max={3} step={0.5} /></Form.Item>
      </Card>
      <Form.Item name="sortOrder" label="排序"><InputNumber min={0} /></Form.Item>
      <Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item>
    </EntityModal>
  );
}

function SkinModal({ open, initialValues, onCancel, onSave }) {
  const values = normalizeSkinFormValues(initialValues);
  return (
    <EntityModal open={open} width={820} title={initialValues?.id ? '编辑皮肤' : '新增皮肤'} initialValues={values} onCancel={onCancel} onSave={onSave}>
      <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}><Input /></Form.Item>
      <Form.Item name="version" label="版本"><Input /></Form.Item>
      <Form.Item name="source" label="来源"><Input /></Form.Item>
      <Form.Item name="background" label="背景"><Input.TextArea rows={3} /></Form.Item>
      <Form.Item name="truth" label="真相"><Input.TextArea rows={3} /></Form.Item>
      <Form.Item name="terms" label="术语 JSON"><Input.TextArea rows={4} /></Form.Item>
      <Form.Item name="clues" label="线索 JSON"><Input.TextArea rows={4} /></Form.Item>
      <Form.Item name="noises" label="噪声 JSON"><Input.TextArea rows={3} /></Form.Item>
      <Form.Item name="memoryExamples" label="记忆示例 JSON"><Input.TextArea rows={3} /></Form.Item>
      <Form.Item name="enabled" label="启用" valuePropName="checked"><Switch /></Form.Item>
    </EntityModal>
  );
}

function ImportSkinModal({ open, onCancel, onImported }) {
  const { message } = AntApp.useApp();
  const [raw, setRaw] = useState('');
  const [template, setTemplate] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setRaw('');
      setTemplate(null);
    }
  }, [open]);

  async function beforeUpload(file) {
    setRaw(await file.text());
    setTemplate(null);
    return false;
  }

  async function submit() {
    setSubmitting(true);
    setTemplate(null);
    try {
      await adminRequest('/skins/import-json', { method: 'POST', body: JSON.stringify({ raw }) });
      await onImported();
    } catch (error) {
      setTemplate(error.template || null);
      message.error(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      width={820}
      title="导入共识迷雾皮肤 JSON"
      onCancel={onCancel}
      onOk={submit}
      okText="校验并导入"
      okButtonProps={{ disabled: !raw.trim(), loading: submitting }}
      destroyOnHidden
    >
      <Space direction="vertical" size={12} className="admin-full">
        <Upload accept=".json,application/json" showUploadList={false} beforeUpload={beforeUpload}>
          <Button icon={<CloudUploadOutlined />}>选择 JSON 文件</Button>
        </Upload>
        <Input.TextArea rows={12} value={raw} onChange={(event) => setRaw(event.target.value)} placeholder="粘贴皮肤 JSON" />
        {template && <pre className="admin-json-template">{JSON.stringify(template, null, 2)}</pre>}
      </Space>
    </Modal>
  );
}

function EntityModal({ open, title, initialValues, width = 640, onCancel, onSave, children }) {
  const [form] = Form.useForm();

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue(initialValues || {});
    }
  }, [form, initialValues, open]);

  return (
    <Modal open={open} width={width} title={title} onCancel={onCancel} onOk={() => form.submit()} destroyOnHidden>
      <Form form={form} layout="vertical" preserve={false} initialValues={initialValues} onFinish={onSave}>
        {children}
      </Form>
    </Modal>
  );
}

function AvatarUpload({ value, onChange }) {
  const { message } = AntApp.useApp();
  const [uploading, setUploading] = useState(false);
  const [open, setOpen] = useState(false);

  async function beforeUpload(file) {
    setUploading(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const result = await adminRequest('/uploads/image', {
        method: 'POST',
        body: JSON.stringify({ filename: file.name, dataUrl })
      });
      onChange?.(result.url);
      message.success('头像已上传');
      setOpen(false);
    } catch (error) {
      message.error(error.message);
    } finally {
      setUploading(false);
    }
    return false;
  }

  return (
    <>
      <button type="button" className="admin-avatar-upload-trigger" onClick={() => setOpen(true)}>
        <Avatar size={72} src={value} icon={<UserOutlined />} />
        <span className="admin-avatar-upload-mask"><CloudUploadOutlined /></span>
      </button>
      <Modal open={open} title="上传玩家头像" footer={null} onCancel={() => setOpen(false)} destroyOnHidden>
        <Space direction="vertical" size={16} className="admin-full">
          <div className="admin-avatar-upload-preview">
            <Avatar size={96} src={value} icon={<UserOutlined />} />
          </div>
          <Upload.Dragger accept="image/png,image/jpeg,image/webp,image/gif" showUploadList={false} beforeUpload={beforeUpload} disabled={uploading}>
            <p className="ant-upload-drag-icon"><CloudUploadOutlined /></p>
            <p className="ant-upload-text">{uploading ? '正在上传...' : '点击或拖拽图片到这里上传'}</p>
            <p className="ant-upload-hint">支持 png、jpg、webp、gif，保存后直接展示数据库中的头像。</p>
          </Upload.Dragger>
        </Space>
      </Modal>
    </>
  );
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

function PlayerDebugModal({ open, player, models, voices, onCancel }) {
  const { message } = AntApp.useApp();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [playingKey, setPlayingKey] = useState('');
  const audioRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setInput('');
      setMessages([]);
      setSending(false);
      setPlayingKey('');
    }
  }, [open]);

  if (!player) return null;
  const model = models.find((item) => item.id === player.modelId);
  const voice = voices.find((item) => item.id === player.voicePackageId);

  async function send() {
    const text = input.trim();
    if (!text) return;
    if (!player.modelId) {
      message.error('该玩家还没有绑定模型');
      return;
    }
    const nextMessages = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    setInput('');
    setSending(true);
    try {
      const result = await adminRequest(`/players/${player.id}/debug-chat`, {
        method: 'POST',
        body: JSON.stringify({ message: text, history: messages })
      });
      setMessages([...nextMessages, { role: 'assistant', content: result.reply || '' }]);
    } catch (error) {
      message.error(error.message);
      setMessages(messages);
    } finally {
      setSending(false);
    }
  }

  async function playReply(item, index) {
    if (!item?.content || !voice) return;
    const key = `assistant-${index}`;
    setPlayingKey(key);
    try {
      await playVoicePackage(voice, item.content, audioRef);
    } catch (error) {
      message.error(error.message);
    } finally {
      setPlayingKey('');
    }
  }

  return (
    <Modal open={open} width={760} title={`调试玩家：${player.nickname || player.name}`} onCancel={onCancel} footer={null} destroyOnHidden>
      <Space direction="vertical" size={12} className="admin-full">
        <Descriptions bordered size="small" column={1}>
          <Descriptions.Item label="昵称">{player.nickname || '-'}</Descriptions.Item>
          <Descriptions.Item label="人格">{player.personality || '-'}</Descriptions.Item>
          <Descriptions.Item label="模型">{model ? `${model.provider}/${model.name}` : '未绑定'}</Descriptions.Item>
          <Descriptions.Item label="语音包">{voice?.name || '未绑定'}</Descriptions.Item>
        </Descriptions>
        <div className="admin-chat-log">
          {messages.length === 0 && <Text type="secondary">输入一句话，测试这个玩家会如何回应。</Text>}
          {messages.map((item, index) => (
            <div key={`${item.role}-${index}`} className={`admin-chat-message ${item.role}`}>
              <strong>{item.role === 'assistant' ? player.nickname || '玩家' : '你'}</strong>
              <p>{item.content}</p>
              {item.role === 'assistant' && item.content && (
                <Button
                  size="small"
                  icon={<PlayCircleOutlined />}
                  disabled={!voice}
                  loading={playingKey === `assistant-${index}`}
                  onClick={() => playReply(item, index)}
                >
                  播放
                </Button>
              )}
            </div>
          ))}
        </div>
        <Input.TextArea rows={3} value={input} onChange={(event) => setInput(event.target.value)} placeholder="输入调试消息" onPressEnter={(event) => {
          if (!event.shiftKey) {
            event.preventDefault();
            send();
          }
        }} />
        <Space>
          <Button type="primary" icon={<MessageOutlined />} loading={sending} onClick={send}>发送</Button>
        </Space>
        <audio ref={audioRef} hidden />
      </Space>
    </Modal>
  );
}

function GameDetailDrawer({ game, modes, onClose, onDelete }) {
  const players = useMemo(() => (game?.players || []).map((player, index) => ({
    ...player,
    _rowKey: String(player.id || player.playerId || player.nickname || player.name || `player-${index}`)
  })), [game]);
  return (
    <Drawer width={720} title="对局详情" open={Boolean(game)} onClose={onClose} extra={game && <Button danger icon={<DeleteOutlined />} onClick={() => onDelete(game.id)}>删除</Button>}>
      {game && (
        <Space direction="vertical" size={16} className="admin-full">
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="类型">{GAME_LABELS[game.gameType] || game.gameType}</Descriptions.Item>
            <Descriptions.Item label="主题">{getGameTitle(game)}</Descriptions.Item>
            <Descriptions.Item label="模式">{formatGameMode(game.mode, game, modes)}</Descriptions.Item>
            <Descriptions.Item label="胜负">{formatWinner(game.winner)}</Descriptions.Item>
            <Descriptions.Item label="时间">{formatTime(game.createdAt)}</Descriptions.Item>
          </Descriptions>
          <Card title="玩家">
            <Table
              size="small"
              rowKey="_rowKey"
              dataSource={players}
              pagination={false}
              columns={[
                { title: '昵称', dataIndex: 'nickname', render: (_, record) => record.nickname || record.name || '-' },
                { title: '阵营/立场', render: (_, record) => formatSideOrCamp(record, game.gameType) },
                { title: '角色', render: (_, record) => formatRole(record, game.gameType) }
              ]}
            />
          </Card>
          <Card title="轮次数据">
            <pre className="admin-json-template">{JSON.stringify(game.rounds || [], null, 2)}</pre>
          </Card>
        </Space>
      )}
    </Drawer>
  );
}

function TableActions({ onEdit, editText = '编辑', onDelete, deleteText = '删除' }) {
  return (
    <Space>
      {onEdit && <Button size="small" icon={<EditOutlined />} onClick={onEdit}>{editText}</Button>}
      {onDelete && <Button size="small" danger icon={<DeleteOutlined />} onClick={onDelete}>{deleteText}</Button>}
    </Space>
  );
}

async function playVoicePackage(voice, text, audioRef) {
  const provider = String(voice.provider || 'browser').trim().toLowerCase();
  const content = String(text || voice.sampleText || '你好，我是本局玩家的试听声音。').trim();
  if (provider === 'browser') {
    playBrowserSpeech(voice, content);
    return;
  }
  const response = await fetch(`/api/admin/voice-packages/${voice.id}/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: content })
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message || '语音试听失败');
  }
  const blob = await response.blob();
  const audio = audioRef.current || new Audio();
  audio.src = URL.createObjectURL(blob);
  await audio.play();
}

function playBrowserSpeech(voice, text) {
  if (!window.speechSynthesis) throw new Error('当前浏览器不支持本地语音试听。');
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = voice.language || 'zh-CN';
  const voices = window.speechSynthesis.getVoices?.() || [];
  const matched = voices.find((item) => item.voiceURI === voice.voiceId || item.name === voice.voiceId)
    || voices.find((item) => item.lang === voice.language)
    || voices.find((item) => /^zh/i.test(item.lang));
  if (matched) utterance.voice = matched;
  window.speechSynthesis.speak(utterance);
}

function normalizePath(pathname) {
  return pathname === '/' ? '/dashboard' : pathname;
}

function enabledTag(value) {
  return <Tag color={value ? 'green' : 'default'}>{value ? '启用' : '停用'}</Tag>;
}

function getGameTitle(game) {
  const topic = game?.topic;
  if (typeof topic === 'string') return topic;
  return topic?.title || game?.event?.name || game?.skinName || game?.event?.id || '-';
}

function modelName(player, models) {
  const linked = models.find((model) => model.id === player.modelId);
  if (linked) return `${linked.provider}/${linked.name}`;
  return player.model || '-';
}

function filterByQuery(items, query, fields) {
  const needle = normalizeSearchText(query);
  if (!needle) return items;
  return items.filter((item) => fields.some((field) => {
    const value = typeof field === 'function' ? field(item) : item?.[field];
    return normalizeSearchText(value).includes(needle);
  }));
}

function uniqueOptions(values, formatter = (value) => value) {
  const seen = new Set();
  return values
    .filter((value) => value !== undefined && value !== null && value !== '')
    .filter((value) => {
      const key = String(value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((value) => ({ value, label: formatter(value) || String(value) }));
}

function booleanOptions() {
  return [
    { value: true, label: '启用' },
    { value: false, label: '停用' }
  ];
}

function summarizeWerewolfRoles(items = [], roles = []) {
  const roleMap = new Map(roles.map((role) => [role.id, role]));
  const text = items.map((item) => `${item.count} ${roleMap.get(item.roleId)?.name || item.roleId}`).join('、');
  return text || '-';
}

function normalizeSearchText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function parseJsonField(value, fallback) {
  if (!value) return fallback;
  if (typeof value !== 'string') return value;
  return JSON.parse(value);
}

function normalizeSkinFormValues(values) {
  const safeValues = values || {};
  return {
    ...emptySkin,
    ...safeValues,
    terms: JSON.stringify(safeValues.terms || {}, null, 2),
    clues: JSON.stringify(safeValues.clues || [], null, 2),
    noises: JSON.stringify(safeValues.noises || [], null, 2),
    memoryExamples: JSON.stringify(safeValues.memoryExamples || [], null, 2)
  };
}

function formatTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function formatApiFormat(value) {
  if (value === 'anthropic-compatible') return 'Anthropic 兼容';
  if (value === 'custom') return '旧版自定义';
  return 'OpenAI 兼容';
}

function formatVoiceProvider(value) {
  if (value === 'azure') return 'Azure Speech';
  if (value === 'browser') return '浏览器本地语音';
  return value || '-';
}

function formatGameMode(value, game, modes = []) {
  const text = String(value || '').trim();
  const modeId = game?.werewolfMode?.id || game?.event?.mode || game?.event?.modeId || text;
  const configuredMode = modes.find((mode) => mode.id === modeId || mode.name === modeId);
  if (configuredMode) return configuredMode.name;
  const map = {
    real: '真实对局',
    imported: '导入对局',
    standard: '标准局',
    'standard-12': '标准局',
    'gargoyle-undertaker': '石像鬼守墓人',
    'thief-cupid': '盗贼丘比特'
  };
  return map[text] || map[modeId] || text || '-';
}

function formatWinner(value) {
  const map = {
    pro: '正方',
    con: '反方',
    good: '好人阵营',
    villager: '好人阵营',
    villagers: '好人阵营',
    werewolf: '狼人阵营',
    wolves: '狼人阵营',
    consensus: '共识达成',
    mist: '迷雾胜利'
  };
  return map[String(value || '').toLowerCase()] || value || '-';
}

function formatSideOrCamp(record, gameType) {
  if (record.sideLabel) return record.sideLabel;
  const raw = record.side || record.camp || record.faction || record.team || '';
  const map = {
    pro: '正方',
    affirmative: '正方',
    con: '反方',
    negative: '反方',
    judge: '评委',
    host: '主持人',
    werewolf: '狼人阵营',
    wolves: '狼人阵营',
    wolf: '狼人阵营',
    good: '好人阵营',
    villager: '好人阵营',
    villagers: '好人阵营',
    god: '神职阵营',
    neutral: '中立阵营',
    investigator: '调查员',
    citizen: '市民',
    mist: '迷雾阵营'
  };
  const formatted = map[String(raw).toLowerCase()];
  if (formatted) return formatted;
  if (gameType === 'debate' && Number.isInteger(record.sideIndex)) return record.side === 'con' ? '反方' : '正方';
  return raw || '-';
}

function formatRole(record, gameType) {
  if (gameType === 'debate' && record.side !== 'judge' && Number.isInteger(record.sideIndex)) return DEBATE_ROLE_LABELS[record.sideIndex] || '-';
  if (record.roleLabel) return record.roleLabel;
  const raw = record.role || record.identity || '';
  const map = {
    werewolf: '狼人',
    villager: '村民',
    seer: '预言家',
    witch: '女巫',
    hunter: '猎人',
    guard: '守卫',
    sheriff: '警长',
    judge: '评委',
    investigator: '调查员',
    host: '主持人'
  };
  return map[String(raw).toLowerCase()] || raw || '-';
}
