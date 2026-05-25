import { useMemo } from 'react';
import { Button, Card, Descriptions, Drawer, Space, Table, Typography } from 'antd';
import { DeleteOutlined, DownloadOutlined } from '@ant-design/icons';
import { formatTime, formatWinner, formatSideOrCamp, formatRole, getGameTitle } from '../../utils/adminHelpers';
import { exportJsonFile, safeFilenamePart } from '../../utils/fileExport';
import type { Game, GamePlayer } from '../../types/game';

const { Text } = Typography;

interface GameDetailDrawerProps {
  game: Game | null;
  onClose: () => void;
  onDelete: (id: string) => void;
}

interface GamePlayerRow extends GamePlayer {
  _rowKey: string;
}

export function GameDetailDrawer({ game, onClose, onDelete }: GameDetailDrawerProps) {
  const players = useMemo((): GamePlayerRow[] => (game?.players || []).map((player, index) => ({
    ...player,
    _rowKey: String(player.id || player.playerId || player.nickname || player.name || `player-${index}`)
  })), [game]);

  const topic = game?.topic || {};

  return (
    <Drawer
      width={760}
      title="对局详情"
      open={Boolean(game)}
      onClose={onClose}
      extra={game && (
        <Space>
          <Button icon={<DownloadOutlined />} onClick={() => exportGameJson(game)}>导出 JSON</Button>
          <Button danger icon={<DeleteOutlined />} onClick={() => onDelete(game.id)}>删除</Button>
        </Space>
      )}
    >
      {game && (
        <Space direction="vertical" size={16} className="admin-full">
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="主题">{getGameTitle(game)}</Descriptions.Item>
            <Descriptions.Item label="胜负">{formatWinner(game.winner)}</Descriptions.Item>
            <Descriptions.Item label="时间">{formatTime(game.createdAt)}</Descriptions.Item>
          </Descriptions>

          {game.gameType === 'debate' && (topic.title || topic.proPosition || topic.conPosition) && (
            <Card size="small" title="辩题详情">
              {topic.title && <p><Text strong>辩题：</Text><Text>{topic.title}</Text></p>}
              {topic.proPosition && <p><Text strong>正方立场：</Text><Text>{topic.proPosition}</Text></p>}
              {topic.conPosition && <p><Text strong>反方立场：</Text><Text>{topic.conPosition}</Text></p>}
            </Card>
          )}

          {game.gameType === 'werewolf' && game.event?.werewolfMode && (
            <Card size="small" title={`模式：${game.event.werewolfMode.name || game.modeName || '-'}`}>
              <p>
                <Text strong>胜利条件：</Text>
                <Text>{game.event.werewolfMode.winCondition === 'side' ? '阵营胜利' : game.event.werewolfMode.winCondition || '-'}</Text>
              </p>
              {(game.event.werewolfMode.roles?.length ?? 0) > 0 && (
                <>
                  <p className="admin-spacer"><Text strong>角色阵容：</Text></p>
                  {game.event.werewolfMode.roles!.map((item, index) => (
                    <Text key={index} className="admin-werewolf-role-tag">{item.roleId || item.name} ×{item.count}</Text>
                  ))}
                </>
              )}
            </Card>
          )}

          <Card title={game.gameType === 'debate' ? '辩手阵容' : '玩家'}>
            <Table
              size="small"
              rowKey="_rowKey"
              dataSource={players}
              pagination={false}
              columns={[
                { title: '昵称', dataIndex: 'nickname', render: (_, record) => record.nickname || record.name || '-' },
                ...(game.gameType === 'debate'
                  ? [
                      { title: '立场', render: (_: unknown, record: GamePlayerRow) => formatSideOrCamp(record, game.gameType) },
                      { title: '辩位', render: (_: unknown, record: GamePlayerRow) => formatRole(record, game.gameType) }
                    ]
                  : [
                      { title: '阵营', render: (_: unknown, record: GamePlayerRow) => formatSideOrCamp(record, game.gameType) },
                      { title: '角色', render: (_: unknown, record: GamePlayerRow) => formatRole(record, game.gameType) }
                    ])
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

function exportGameJson(game: Game): void {
  exportJsonFile(game, `game-${safeFilenamePart(game?.gameType || game?.type || 'unknown')}-${safeFilenamePart(game?.id || Date.now())}.json`);
}
