import { useEffect, useMemo, useState } from 'react';
import { App as AntApp, Button, Card, Input, Modal, Space, Table, Typography, Upload } from 'antd';
import { CloudUploadOutlined } from '@ant-design/icons';
import { adminRequest } from '../../services/adminApi';
import { GAME_LABELS } from '../../constants/adminConstants';
import { filterByQuery, uniqueOptions, formatTime, formatGameMode, formatWinner, getGameTitle, buildImportGenerationPrompt, copyText } from '../../utils/adminHelpers';
import { TableActions } from '../../components/shared/TableActions';
import { ListFilterBar } from '../../components/shared/ListFilterBar';
import { GameDetailDrawer } from '../../components/GameDetailDrawer';
import type { Game, GameType, PreloadTask } from '../../types/game';
import type { Player } from '../../types/entities';
import type { WerewolfMode } from '../../types/entities';
import type { FilterState } from '../../types/api';
import type { AdminApiError } from '../../types/api';

const { Text } = Typography;

interface GameHistoryProps {
  gameType: GameType;
}

export function GameHistory({ gameType }: GameHistoryProps) {
  const { message } = AntApp.useApp();
  const [games, setGames] = useState<Game[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [werewolfModes, setWerewolfModes] = useState<WerewolfMode[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [filters, setFilters] = useState<FilterState>({});
  const [preloadTask, setPreloadTask] = useState<PreloadTask | null>(null);
  const [gameDetail, setGameDetail] = useState<Game | null>(null);

  useEffect(() => {
    setLoading(true);
    const gamesReq = adminRequest<Game[]>(`/games?gameType=${gameType}`);
    const playersReq = adminRequest<Player[]>('/players');
    const modesReq = gameType === 'werewolf' ? adminRequest<WerewolfMode[]>('/werewolf-modes') : Promise.resolve(null as WerewolfMode[] | null);
    Promise.all([gamesReq, playersReq, modesReq])
      .then(([g, p, m]) => {
        setGames(g);
        setPlayers(p);
        if (m) setWerewolfModes(m);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [gameType]);

  async function refresh() {
    setLoading(true);
    try {
      const gamesReq = adminRequest<Game[]>(`/games?gameType=${gameType}`);
      const playersReq = adminRequest<Player[]>('/players');
      const modesReq = gameType === 'werewolf' ? adminRequest<WerewolfMode[]>('/werewolf-modes') : Promise.resolve(null as WerewolfMode[] | null);
      const [g, p, m] = await Promise.all([gamesReq, playersReq, modesReq]);
      setGames(g);
      setPlayers(p);
      if (m) setWerewolfModes(m);
    } finally {
      setLoading(false);
    }
  }

  async function openGame(id: string) {
    try {
      setGameDetail(await adminRequest<Game>(`/games/${id}`));
    } catch (error) {
      message.error((error as Error).message);
    }
  }

  async function deleteGame(id: string) {
    try {
      await adminRequest(`/games/${id}`, { method: 'DELETE' });
      setGameDetail(null);
      message.success('已删除对局');
      await refresh();
    } catch (error) {
      message.error((error as Error).message);
    }
  }

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
            { key: 'mode', placeholder: '模式', options: uniqueOptions(gamePool.map((game) => game.mode), (value) => formatGameMode(String(value), { gameType }, werewolfModes)) },
            { key: 'winner', placeholder: '胜负', options: uniqueOptions(gamePool.map((game) => game.winner), formatWinner) }
          ]}
        />
        <GameTable games={filtered} loading={loading} onOpen={openGame} onDelete={deleteGame} onPreload={setPreloadTask} modes={werewolfModes} />
      </Card>
      <ImportGameModal open={importing} gameType={gameType} players={players} onCancel={() => setImporting(false)} onImported={async () => {
        setImporting(false);
        await refresh();
      }} />
      <ResourcePreloadModal task={preloadTask} onClose={() => setPreloadTask(null)} />
      <GameDetailDrawer game={gameDetail} onClose={() => setGameDetail(null)} onDelete={deleteGame} />
    </>
  );
}

interface ImportGameModalProps {
  open: boolean;
  gameType: GameType;
  players: Player[];
  onCancel: () => void;
  onImported: () => Promise<void>;
}

function ImportGameModal({ open, gameType, players = [], onCancel, onImported }: ImportGameModalProps) {
  const { message } = AntApp.useApp();
  const [raw, setRaw] = useState('');
  const [template, setTemplate] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const generationPrompt = useMemo(() => buildImportGenerationPrompt(gameType, players), [gameType, players]);

  useEffect(() => {
    if (!open) { setRaw(''); setTemplate(null); }
  }, [open]);

  async function submit() {
    setSubmitting(true);
    setTemplate(null);
    try {
      await adminRequest('/games/import', { method: 'POST', body: JSON.stringify({ gameType, raw }) });
      message.success('导入成功，已写入对局历史');
      await onImported();
    } catch (error) {
      setTemplate((error as AdminApiError).template || null);
      message.error((error as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function beforeUpload(file: File) {
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
        {template ? <pre className="admin-json-template">{String(JSON.stringify(template, null, 2) ?? '')}</pre> : null}
      </Space>
    </Modal>
  );
}

interface GameTableProps {
  games: Game[];
  loading: boolean;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onPreload: (task: PreloadTask) => void;
  modes: WerewolfMode[];
}

function GameTable({ games, loading, onOpen, onDelete, onPreload, modes = [] }: GameTableProps) {
  const { message } = AntApp.useApp();
  async function preload(record: Game) {
    try {
      const task = await adminRequest<PreloadTask>(`/games/${record.id}/preload-resources`, { method: 'POST', body: JSON.stringify({}) });
      onPreload?.(task);
    } catch (error) {
      message.error((error as Error).message);
    }
  }
  return (
    <Table
      rowKey="id"
      loading={loading}
      dataSource={games}
      pagination={{ pageSize: 10 }}
      columns={[
        { title: '类型', dataIndex: 'gameType', render: (value: string) => GAME_LABELS[value] || value },
        { title: '模式', dataIndex: 'mode', render: (value: string, record: Game) => formatGameMode(value, record, modes) },
        { title: '主题', ellipsis: true, render: (_: unknown, record: Game) => getGameTitle(record) },
        { title: '胜负', dataIndex: 'winner', render: formatWinner },
        { title: '时间', dataIndex: 'createdAt', render: formatTime },
        {
          title: '操作',
          width: 260,
          render: (_: unknown, record: Game) => (
            <Space>
              {record.mode === 'imported' && (
                <Button size="small" icon={<CloudUploadOutlined />} onClick={() => preload(record)}>
                  资源预加载
                </Button>
              )}
              <TableActions onEdit={() => onOpen?.(record.id)} editText="详情" onDelete={onDelete ? () => onDelete(record.id) : undefined} />
            </Space>
          )
        }
      ]}
    />
  );
}

interface ResourcePreloadModalProps {
  task: PreloadTask | null;
  onClose: () => void;
}

function ResourcePreloadModal({ task, onClose }: ResourcePreloadModalProps) {
  const [current, setCurrent] = useState<PreloadTask | null>(task);

  useEffect(() => {
    setCurrent(task);
    if (!task?.id || task.status !== 'running') return undefined;
    const timer = window.setInterval(async () => {
      try {
        const next = await adminRequest<PreloadTask>(`/resource-preload-tasks/${task.id}`);
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
