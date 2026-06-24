import { useCallback, useEffect, useState } from 'react';
import { App as AntApp, Button, Card, Modal, Select, Space, Statistic, Table, Typography } from 'antd';
import { DeleteOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  clearPlayerMemories,
  getPlayerMemories,
  getPlayerMemoryStats,
  type PlayerMemoryRecord,
  type PlayerMemoryStats,
} from '../../services/adminApi';
import { MemoryDetailDrawer } from './MemoryDetailDrawer';

const { Text, Title } = Typography;

const LABELS: Record<'werewolf' | 'debate' | 'all', string> = {
  werewolf: '狼人杀',
  debate: '辩论赛',
  all: '所有游戏',
};

export function MemoryManager() {
  const { message } = AntApp.useApp();
  const [stats, setStats] = useState<PlayerMemoryStats | null>(null);
  const [loading, setLoading] = useState(false);

  const [records, setRecords] = useState<PlayerMemoryRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [gameTypeFilter, setGameTypeFilter] = useState<string | undefined>(undefined);
  const [selectedRecord, setSelectedRecord] = useState<PlayerMemoryRecord | null>(null);

  async function load(): Promise<void> {
    setLoading(true);
    try {
      setStats(await getPlayerMemoryStats());
    } catch (error) {
      message.error(error instanceof Error ? error.message : '读取记忆统计失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const loadRecords = useCallback(async (): Promise<void> => {
    setRecordsLoading(true);
    try {
      const result = await getPlayerMemories({ gameType: gameTypeFilter, page, pageSize });
      setRecords(result.items);
      setTotal(result.total);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '读取记忆记录失败');
    } finally {
      setRecordsLoading(false);
    }
  }, [gameTypeFilter, page, pageSize, message]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  function confirmClear(gameType: 'werewolf' | 'debate' | 'all'): void {
    const count = gameType === 'all'
      ? Number(stats?.total || 0)
      : Number(stats?.games.find((item) => item.gameType === gameType)?.count || 0);
    Modal.confirm({
      title: `清除${LABELS[gameType]}长期记忆`,
      content: `将删除 ${count} 条跨局玩家画像。进行中的比赛会话、历史比赛、Trace 和玩家基础人格不会被删除。此操作不可撤销。`,
      okText: '确认清除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      async onOk() {
        try {
          const result = await clearPlayerMemories(gameType);
          message.success(`已删除 ${result.deletedCount} 条记忆`);
          setPage(1);
          await load();
          await loadRecords();
        } catch (error) {
          message.error(error instanceof Error ? error.message : '清除长期记忆失败');
          throw error;
        }
      },
    });
  }

  const rows = stats?.games || [];

  return (
    <Space direction="vertical" size={16} className="admin-full">
      <Space align="start" style={{ justifyContent: 'space-between', width: '100%' }}>
        <div>
          <Title level={3} style={{ marginTop: 0 }}>记忆管理</Title>
          <Text type="secondary">管理玩家在不同游戏中形成的跨局交手画像。本局会话不受这些操作影响。</Text>
        </div>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>刷新</Button>
      </Space>

      <Space size={16}>
        <Card><Statistic title="长期记忆总数" value={stats?.total || 0} /></Card>
        <Card><Statistic title="最后更新" value={formatTime(stats?.lastUpdatedAt)} /></Card>
      </Space>

      <Table
        rowKey="gameType"
        loading={loading}
        pagination={false}
        dataSource={rows}
        columns={[
          { title: '游戏', dataIndex: 'gameType', render: (value) => LABELS[value as 'werewolf' | 'debate'] },
          { title: '画像数量', dataIndex: 'count' },
          { title: '最后更新', dataIndex: 'lastUpdatedAt', render: formatTime },
          {
            title: '操作',
            render: (_, row) => (
              <Button danger icon={<DeleteOutlined />} onClick={() => confirmClear(row.gameType)}>
                清除{LABELS[row.gameType]}记忆
              </Button>
            ),
          },
        ]}
      />

      <Card
        title={
          <Space>
            <span>记忆记录</span>
            <Select
              allowClear
              placeholder="筛选游戏类型"
              style={{ width: 140 }}
              value={gameTypeFilter}
              onChange={(value) => { setGameTypeFilter(value); setPage(1); }}
              options={[
                { value: 'werewolf', label: '狼人杀' },
                { value: 'debate', label: '辩论赛' },
              ]}
            />
          </Space>
        }
      >
        <Table
          rowKey="id"
          size="small"
          loading={recordsLoading}
          dataSource={records}
          columns={[
            { title: 'ID', dataIndex: 'id', width: 60 },
            {
              title: '画像主体', width: 120,
              render: (_: unknown, record: PlayerMemoryRecord) =>
                record.subjectNickname || record.subjectName || `玩家${record.subjectPlayerId}`,
            },
            {
              title: '画像所有者', width: 120,
              render: (_: unknown, record: PlayerMemoryRecord) =>
                record.ownerNickname || record.ownerName || `玩家${record.ownerPlayerId}`,
            },
            {
              title: '游戏', dataIndex: 'gameType', width: 80,
              render: (value: string) => LABELS[value as 'werewolf' | 'debate'] ?? value,
            },
            { title: '交手局数', dataIndex: 'gamesPlayed', width: 80 },
            { title: '画像摘要', dataIndex: 'summary', ellipsis: true },
            { title: '更新于', dataIndex: 'updatedAt', width: 160, render: formatTime },
            {
              title: '操作', width: 80,
              render: (_: unknown, record: PlayerMemoryRecord) => (
                <Button
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={(e) => { e.stopPropagation(); setSelectedRecord(record); }}
                >
                  查看
                </Button>
              ),
            },
          ]}
          pagination={{
            current: page,
            pageSize,
            total,
            onChange: (newPage) => setPage(newPage),
            showSizeChanger: false,
          }}
          onRow={(record) => ({
            style: { cursor: 'pointer' },
            onClick: () => setSelectedRecord(record),
          })}
        />
      </Card>

      <Card>
        <Title level={5}>全部长期记忆</Title>
        <Text type="secondary">同时清除狼人杀和辩论赛画像，不影响正在进行的比赛上下文。</Text>
        <div style={{ marginTop: 12 }}>
          <Button danger icon={<DeleteOutlined />} onClick={() => confirmClear('all')}>
            清除所有游戏记忆
          </Button>
        </div>
      </Card>

      <MemoryDetailDrawer record={selectedRecord} onClose={() => setSelectedRecord(null)} />
    </Space>
  );
}

function formatTime(value: string | null | undefined): string {
  if (!value) return '暂无';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
