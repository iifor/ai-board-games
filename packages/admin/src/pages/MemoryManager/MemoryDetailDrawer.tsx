import { Card, Descriptions, Drawer, Space, Typography } from 'antd';
import type { PlayerMemoryRecord } from '../../services/adminApi';

const { Text } = Typography;

const GAME_LABELS: Record<string, string> = {
  werewolf: '狼人杀',
  debate: '辩论赛',
};

interface MemoryDetailDrawerProps {
  record: PlayerMemoryRecord | null;
  onClose: () => void;
}

export function MemoryDetailDrawer({ record, onClose }: MemoryDetailDrawerProps) {
  if (!record) return null;

  const ownerLabel =
    record.ownerNickname || record.ownerName || `玩家${record.ownerPlayerId}`;
  const subjectLabel =
    record.subjectNickname || record.subjectName || `玩家${record.subjectPlayerId}`;

  return (
    <Drawer
      width={560}
      title="记忆详情"
      open={Boolean(record)}
      onClose={onClose}
      destroyOnHidden
    >
      <Space direction="vertical" size={16} className="admin-full">
        <Descriptions bordered size="small" column={1}>
          <Descriptions.Item label="ID">{record.id}</Descriptions.Item>
          <Descriptions.Item label="游戏">
            {GAME_LABELS[record.gameType] ?? record.gameType}
          </Descriptions.Item>
          <Descriptions.Item label="画像所有者">{ownerLabel}</Descriptions.Item>
          <Descriptions.Item label="画像主体">{subjectLabel}</Descriptions.Item>
          <Descriptions.Item label="交手局数">{record.gamesPlayed}</Descriptions.Item>
          <Descriptions.Item label="创建于">{formatTime(record.createdAt)}</Descriptions.Item>
          <Descriptions.Item label="更新于">{formatTime(record.updatedAt)}</Descriptions.Item>
        </Descriptions>

        <Card size="small" title="画像摘要">
          {record.summary ? (
            <Text>{record.summary}</Text>
          ) : (
            <Text type="secondary">暂无画像数据</Text>
          )}
        </Card>
      </Space>
    </Drawer>
  );
}

function formatTime(value: string | null | undefined): string {
  if (!value) return '暂无';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
