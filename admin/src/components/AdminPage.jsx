import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Database, Eye, Import, Layers, Pencil, Plus, RefreshCw, Trash2, UsersRound } from 'lucide-react';
import { adminRequest } from '../api/adminApi';

const tabs = [
  { key: 'dashboard', label: '仪表盘', icon: Database },
  { key: 'skins', label: '皮肤管理', icon: Layers },
  { key: 'players', label: '玩家管理', icon: UsersRound },
  { key: 'games', label: '对局管理', icon: Eye }
];

const emptySkin = {
  name: '',
  version: 'v3.2',
  source: 'admin',
  terms: {
    investigators: '调查方',
    mist: '迷雾方',
    keyFigure: '关键人物',
    cover: '掩护者',
    suspicionMark: '嫌疑标记',
    exclusion: '排除行动',
    lastTestimony: '最后证词'
  },
  background: '',
  truth: '',
  clues: [],
  noises: [],
  memoryExamples: [],
  enabled: true
};

const emptyPlayer = {
  nickname: '',
  name: '',
  avatar: '',
  sex: '未知',
  personality: '',
  provider: 'deepseek',
  model: 'deepseek-chat',
  temperature: 0.85,
  enabled: true
};

export function AdminPage() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState(null);
  const [skins, setSkins] = useState([]);
  const [players, setPlayers] = useState([]);
  const [games, setGames] = useState([]);
  const [gameDetail, setGameDetail] = useState(null);
  const [skinEditor, setSkinEditor] = useState(null);
  const [playerEditor, setPlayerEditor] = useState(null);
  const [filters, setFilters] = useState({ mode: '', winner: '', skinId: '', playerId: '' });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    refreshAll();
  }, []);

  async function refreshAll() {
    setLoading(true);
    setMessage('');
    try {
      const [nextStats, nextSkins, nextPlayers, nextGames] = await Promise.all([
        adminRequest('/stats'),
        adminRequest('/skins'),
        adminRequest('/players'),
        adminRequest('/games')
      ]);
      setStats(nextStats);
      setSkins(nextSkins);
      setPlayers(nextPlayers);
      setGames(nextGames);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function refreshGames(nextFilters = filters) {
    const query = new URLSearchParams(Object.entries(nextFilters).filter(([, value]) => value)).toString();
    setGames(await adminRequest(`/games${query ? `?${query}` : ''}`));
  }

  async function toggleSkin(skin) {
    await adminRequest(`/skins/${skin.id}/enabled`, { method: 'PATCH', body: JSON.stringify({ enabled: !skin.enabled }) });
    await refreshAll();
  }

  async function deleteSkin(id) {
    if (!window.confirm('确认删除这个皮肤吗？已被对局引用的皮肤不能删除。')) return;
    await adminRequest(`/skins/${id}`, { method: 'DELETE' });
    await refreshAll();
  }

  async function importMarkdown() {
    await adminRequest('/skins/import-markdown', { method: 'POST', body: '{}' });
    setMessage('已从 Markdown 重新导入皮肤包。');
    await refreshAll();
  }

  async function saveSkin(form) {
    const method = form.id ? 'PUT' : 'POST';
    const path = form.id ? `/skins/${form.id}` : '/skins';
    await adminRequest(path, { method, body: JSON.stringify(form) });
    setSkinEditor(null);
    await refreshAll();
  }

  async function togglePlayer(player) {
    await adminRequest(`/players/${player.id}/enabled`, { method: 'PATCH', body: JSON.stringify({ enabled: !player.enabled }) });
    await refreshAll();
  }

  async function deletePlayer(id) {
    if (!window.confirm('确认删除这个玩家吗？已被历史对局引用的玩家不能删除。')) return;
    await adminRequest(`/players/${id}`, { method: 'DELETE' });
    await refreshAll();
  }

  async function savePlayer(form) {
    const method = form.id ? 'PUT' : 'POST';
    const path = form.id ? `/players/${form.id}` : '/players';
    await adminRequest(path, { method, body: JSON.stringify(form) });
    setPlayerEditor(null);
    await refreshAll();
  }

  async function movePlayer(player, direction) {
    const ordered = [...players];
    const index = ordered.findIndex((item) => item.id === player.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    await adminRequest('/players/reorder', {
      method: 'PATCH',
      body: JSON.stringify({ players: ordered.map((item, sortIndex) => ({ id: item.id, sortOrder: sortIndex + 1 })) })
    });
    await refreshAll();
  }

  async function openGame(id) {
    setGameDetail(await adminRequest(`/games/${id}`));
  }

  async function deleteGame(id) {
    if (!window.confirm('确认删除这条对局记录吗？')) return;
    await adminRequest(`/games/${id}`, { method: 'DELETE' });
    setGameDetail(null);
    await refreshGames();
    await refreshAll();
  }

  function updateFilters(patch) {
    const next = { ...filters, ...patch };
    setFilters(next);
    refreshGames(next).catch((error) => setMessage(error.message));
  }

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <a className="admin-back" href="/"><ArrowLeft size={18} />返回 C 端</a>
        <h1>B 端管理后台</h1>
        <nav>
          {tabs.map(({ key, label, icon: Icon }) => (
            <button className={activeTab === key ? 'active' : ''} key={key} onClick={() => setActiveTab(key)}>
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
      </aside>

      <section className="admin-main">
        <header className="admin-header">
          <div>
            <p className="eyebrow">CONSENSUS MIST OPS</p>
            <h2>{tabs.find((tab) => tab.key === activeTab)?.label}</h2>
          </div>
          <button className="admin-icon-button" onClick={refreshAll} disabled={loading}>
            <RefreshCw size={18} />
            刷新
          </button>
        </header>

        {message && <p className="admin-message">{message}</p>}
        {activeTab === 'dashboard' && <Dashboard stats={stats} />}
        {activeTab === 'skins' && <SkinManager skins={skins} onCreate={() => setSkinEditor(emptySkin)} onEdit={setSkinEditor} onToggle={toggleSkin} onDelete={deleteSkin} onImport={importMarkdown} />}
        {activeTab === 'players' && <PlayerManager players={players} onCreate={() => setPlayerEditor(emptyPlayer)} onEdit={setPlayerEditor} onToggle={togglePlayer} onDelete={deletePlayer} onMove={movePlayer} />}
        {activeTab === 'games' && <GameManager games={games} skins={skins} players={players} filters={filters} onFilter={updateFilters} onOpen={openGame} onDelete={deleteGame} />}
      </section>

      {skinEditor && <SkinEditor skin={skinEditor} onCancel={() => setSkinEditor(null)} onSave={saveSkin} />}
      {playerEditor && <PlayerEditor player={playerEditor} onCancel={() => setPlayerEditor(null)} onSave={savePlayer} />}
      {gameDetail && <GameDetailModal game={gameDetail} onClose={() => setGameDetail(null)} onDelete={deleteGame} />}
    </main>
  );
}

function Dashboard({ stats }) {
  const items = [
    ['皮肤总数', stats?.skins ?? 0],
    ['启用皮肤', stats?.enabledSkins ?? 0],
    ['玩家总数', stats?.players ?? 0],
    ['启用玩家', stats?.enabledPlayers ?? 0],
    ['历史对局', stats?.games ?? 0]
  ];
  return (
    <section className="admin-stat-grid">
      {items.map(([label, value]) => (
        <article className="admin-stat" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </article>
      ))}
      <article className="admin-db-path">
        <span>SQLite 数据库</span>
        <strong>{stats?.databasePath || 'data/consensus-mist.sqlite'}</strong>
      </article>
    </section>
  );
}

function SkinManager({ skins, onCreate, onEdit, onToggle, onDelete, onImport }) {
  return (
    <section className="admin-panel">
      <div className="admin-toolbar">
        <button onClick={onCreate}><Plus size={16} />新增皮肤</button>
        <button onClick={onImport}><Import size={16} />导入 Markdown</button>
      </div>
      <AdminTable headers={['名称', '版本', '来源', '状态', '线索', '操作']}>
        {skins.map((skin) => (
          <tr key={skin.id}>
            <td><strong>{skin.name}</strong><small>{skin.id}</small></td>
            <td>{skin.version}</td>
            <td>{skin.source}</td>
            <td>{skin.enabled ? '启用' : '停用'}</td>
            <td>{skin.clues?.length || 0} 组</td>
            <td className="admin-actions">
              <button onClick={() => onEdit(skin)}><Pencil size={15} />编辑</button>
              <button onClick={() => onToggle(skin)}>{skin.enabled ? '停用' : '启用'}</button>
              <button className="danger" onClick={() => onDelete(skin.id)}><Trash2 size={15} />删除</button>
            </td>
          </tr>
        ))}
      </AdminTable>
    </section>
  );
}

function PlayerManager({ players, onCreate, onEdit, onToggle, onDelete, onMove }) {
  return (
    <section className="admin-panel">
      <div className="admin-toolbar">
        <button onClick={onCreate}><Plus size={16} />新增玩家</button>
      </div>
      <AdminTable headers={['排序', '玩家', '性别', '人格', '模型', '状态', '操作']}>
        {players.map((player) => (
          <tr key={player.id}>
            <td>{player.sortOrder}</td>
            <td><strong>{player.nickname}</strong><small>{player.avatar || player.name}</small></td>
            <td>{player.sex}</td>
            <td className="admin-ellipsis">{player.personality}</td>
            <td>{player.provider}/{player.model}</td>
            <td>{player.enabled ? '启用' : '停用'}</td>
            <td className="admin-actions">
              <button onClick={() => onMove(player, -1)}>上移</button>
              <button onClick={() => onMove(player, 1)}>下移</button>
              <button onClick={() => onEdit(player)}><Pencil size={15} />编辑</button>
              <button onClick={() => onToggle(player)}>{player.enabled ? '停用' : '启用'}</button>
              <button className="danger" onClick={() => onDelete(player.id)}><Trash2 size={15} />删除</button>
            </td>
          </tr>
        ))}
      </AdminTable>
    </section>
  );
}

function GameManager({ games, skins, players, filters, onFilter, onOpen, onDelete }) {
  return (
    <section className="admin-panel">
      <div className="admin-filters">
        <select value={filters.mode} onChange={(event) => onFilter({ mode: event.target.value })}>
          <option value="">全部模式</option>
          <option value="mock">Mock</option>
          <option value="real">真实 AI</option>
        </select>
        <select value={filters.winner} onChange={(event) => onFilter({ winner: event.target.value })}>
          <option value="">全部胜方</option>
          <option value="investigators">调查方</option>
          <option value="mist">迷雾方</option>
        </select>
        <select value={filters.skinId} onChange={(event) => onFilter({ skinId: event.target.value })}>
          <option value="">全部皮肤</option>
          {skins.map((skin) => <option value={skin.id} key={skin.id}>{skin.name}</option>)}
        </select>
        <select value={filters.playerId} onChange={(event) => onFilter({ playerId: event.target.value })}>
          <option value="">全部玩家</option>
          {players.map((player) => <option value={player.id} key={player.id}>{player.nickname}</option>)}
        </select>
      </div>
      <AdminTable headers={['时间', '模式', '皮肤', '胜方', '原因', '操作']}>
        {games.map((game) => (
          <tr key={game.id}>
            <td>{formatTime(game.createdAt)}</td>
            <td>{game.mode}</td>
            <td>{game.skinName}</td>
            <td>{formatWinner(game.winner)}</td>
            <td className="admin-ellipsis">{game.winReason}</td>
            <td className="admin-actions">
              <button onClick={() => onOpen(game.id)}><Eye size={15} />详情</button>
              <button className="danger" onClick={() => onDelete(game.id)}><Trash2 size={15} />删除</button>
            </td>
          </tr>
        ))}
      </AdminTable>
    </section>
  );
}

function AdminTable({ headers, children }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead><tr>{headers.map((item) => <th key={item}>{item}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function SkinEditor({ skin, onCancel, onSave }) {
  const [form, setForm] = useState(() => ({
    ...skin,
    termsText: jsonText(skin.terms || emptySkin.terms),
    cluesText: jsonText(skin.clues || []),
    noisesText: jsonText(skin.noises || []),
    memoryText: jsonText(skin.memoryExamples || [])
  }));
  const [error, setError] = useState('');

  function submit() {
    try {
      onSave({
        ...form,
        terms: JSON.parse(form.termsText || '{}'),
        clues: JSON.parse(form.cluesText || '[]'),
        noises: JSON.parse(form.noisesText || '[]'),
        memoryExamples: JSON.parse(form.memoryText || '[]')
      });
    } catch {
      setError('JSON 字段格式不正确。');
    }
  }

  return (
    <EditorModal title={form.id ? '编辑皮肤' : '新增皮肤'} onCancel={onCancel} onSave={submit} error={error}>
      <Field label="名称"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
      <Field label="版本"><input value={form.version} onChange={(event) => setForm({ ...form, version: event.target.value })} /></Field>
      <Field label="来源"><input value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} /></Field>
      <Field label="事件背景"><textarea value={form.background} onChange={(event) => setForm({ ...form, background: event.target.value })} /></Field>
      <Field label="最终真相"><textarea value={form.truth} onChange={(event) => setForm({ ...form, truth: event.target.value })} /></Field>
      <Field label="术语 JSON"><textarea value={form.termsText} onChange={(event) => setForm({ ...form, termsText: event.target.value })} /></Field>
      <Field label="线索 JSON"><textarea value={form.cluesText} onChange={(event) => setForm({ ...form, cluesText: event.target.value })} /></Field>
      <Field label="噪音 JSON"><textarea value={form.noisesText} onChange={(event) => setForm({ ...form, noisesText: event.target.value })} /></Field>
      <Field label="记忆卡示例 JSON"><textarea value={form.memoryText} onChange={(event) => setForm({ ...form, memoryText: event.target.value })} /></Field>
      <label className="admin-check"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />启用</label>
    </EditorModal>
  );
}

function PlayerEditor({ player, onCancel, onSave }) {
  const [form, setForm] = useState(player);
  return (
    <EditorModal title={form.id ? '编辑玩家' : '新增玩家'} onCancel={onCancel} onSave={() => onSave(form)}>
      <Field label="昵称"><input value={form.nickname} onChange={(event) => setForm({ ...form, nickname: event.target.value })} /></Field>
      <Field label="姓名"><input value={form.name || ''} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
      <Field label="头像 URL/路径"><input value={form.avatar || ''} onChange={(event) => setForm({ ...form, avatar: event.target.value })} /></Field>
      <Field label="性别"><input value={form.sex || ''} onChange={(event) => setForm({ ...form, sex: event.target.value })} /></Field>
      <Field label="人格"><textarea value={form.personality || ''} onChange={(event) => setForm({ ...form, personality: event.target.value })} /></Field>
      <Field label="供应商"><input value={form.provider || ''} onChange={(event) => setForm({ ...form, provider: event.target.value })} /></Field>
      <Field label="模型"><input value={form.model || ''} onChange={(event) => setForm({ ...form, model: event.target.value })} /></Field>
      <Field label="温度"><input type="number" step="0.05" value={form.temperature} onChange={(event) => setForm({ ...form, temperature: Number(event.target.value) })} /></Field>
      <label className="admin-check"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />启用</label>
    </EditorModal>
  );
}

function GameDetailModal({ game, onClose, onDelete }) {
  const keyFigure = useMemo(() => game.players?.find((player) => player.role === 'keyFigure'), [game]);
  return (
    <EditorModal title="对局详情" onCancel={onClose} onSave={onClose} saveLabel="关闭">
      <div className="admin-detail">
        <p><strong>{game.skinName}</strong> · {formatTime(game.createdAt)} · {formatWinner(game.winner)}</p>
        <p>{game.winReason}</p>
        <p>关键人物：{keyFigure ? `${keyFigure.id}号 ${keyFigure.nickname}` : '未记录'}</p>
        <h3>玩家快照</h3>
        <pre>{JSON.stringify(game.players, null, 2)}</pre>
        <h3>回合数据</h3>
        <pre>{JSON.stringify(game.rounds, null, 2)}</pre>
        <button className="danger admin-delete-wide" onClick={() => onDelete(game.id)}>删除此对局</button>
      </div>
    </EditorModal>
  );
}

function EditorModal({ title, children, onCancel, onSave, error, saveLabel = '保存' }) {
  return (
    <div className="admin-modal-backdrop">
      <section className="admin-modal" role="dialog" aria-modal="true">
        <header>
          <h2>{title}</h2>
          <button onClick={onCancel}>取消</button>
        </header>
        <div className="admin-modal-body">{children}</div>
        {error && <p className="admin-message">{error}</p>}
        <footer>
          <button onClick={onCancel}>取消</button>
          <button className="primary" onClick={onSave}>{saveLabel}</button>
        </footer>
      </section>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="admin-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function jsonText(value) {
  return JSON.stringify(value, null, 2);
}

function formatWinner(winner) {
  if (winner === 'investigators') return '调查方';
  if (winner === 'mist') return '迷雾方';
  return winner || '未结算';
}

function formatTime(value) {
  return value ? new Date(value).toLocaleString() : '';
}
