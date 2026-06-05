import { useEffect, useState } from 'react';
import { App as AntApp, Button, Card, Modal, Space, Statistic, Table, Typography } from 'antd';
import { DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  clearPlayerMemories,
  getPlayerMemoryStats,
  type PlayerMemoryStats,
} from '../../services/adminApi';

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
          await load();
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

      <Card>
        <Title level={5}>全部长期记忆</Title>
        <Text type="secondary">同时清除狼人杀和辩论赛画像，不影响正在进行的比赛上下文。</Text>
        <div style={{ marginTop: 12 }}>
          <Button danger icon={<DeleteOutlined />} onClick={() => confirmClear('all')}>
            清除所有游戏记忆
          </Button>
        </div>
      </Card>
    </Space>
  );
}

function formatTime(value: string | null | undefined): string {
  if (!value) return '暂无';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
