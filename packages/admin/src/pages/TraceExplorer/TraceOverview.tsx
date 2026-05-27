import { Button, Card, Descriptions, Table, Tag, Typography } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { GAME_LABELS } from '../../constants/adminConstants';
import { formatTokenCount } from './traceMetrics';
import { translateStatus, translateModelName, translateProvider } from '../../constants/traceLabels';
import type { Trace } from '../../types/trace';
import type { FullTokenSummary } from './traceMetrics';

const { Text, Title } = Typography;
const STATUS_COLORS: Record<string, string> = { recording: 'processing', completed: 'success', error: 'error' };

interface TraceOverviewProps {
  trace: Trace;
  tokenSummary: FullTokenSummary;
  playerIds?: number[];
  onOpenPlayer: (playerId: number) => void;
  getPlayerLabel?: (playerId: number | undefined | null) => string;
}

export function TraceOverview({ trace, tokenSummary, playerIds = [], onOpenPlayer, getPlayerLabel }: TraceOverviewProps) {
  return (
    <div className="admin-trace-overview">
      {trace && (
        <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
          <Descriptions.Item label="Trace ID"><Text code>{trace.id}</Text></Descriptions.Item>
          <Descriptions.Item label="游戏类型"><Tag>{GAME_LABELS[trace.game_type] || trace.game_type}</Tag></Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag color={STATUS_COLORS[trace.status] || 'default'}>{translateStatus(trace.status)}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="耗时">{trace.duration_ms ? `${(trace.duration_ms / 1000).toFixed(1)}s` : '-'}</Descriptions.Item>
          <Descriptions.Item label="LLM 调用">{trace.llm_call_count}</Descriptions.Item>
          <Descriptions.Item label="Agent 决策">{trace.agent_decision_count}</Descriptions.Item>
          <Descriptions.Item label="游戏事件">{trace.event_count}</Descriptions.Item>
          <Descriptions.Item label="总 Token 消耗">
            <Text strong>{formatTokenCount(tokenSummary.totalTokens)}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="Prompt / Completion">
            {formatTokenCount(tokenSummary.promptTokens)} / {formatTokenCount(tokenSummary.completionTokens)}
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">{trace.created_at ? new Date(trace.created_at).toLocaleString() : '-'}</Descriptions.Item>
          {trace.error_message && (
            <Descriptions.Item label="错误信息" span={2}>
              <Text type="danger">{trace.error_message}</Text>
            </Descriptions.Item>
          )}
        </Descriptions>
      )}

      {tokenSummary.byModel.length > 0 && (
        <Card size="small" title="模型 Token 消耗" style={{ marginBottom: 16 }}>
          <Table
            className="admin-trace-table"
            dataSource={tokenSummary.byModel}
            rowKey={(r) => `${r.provider}:${r.model}`}
            size="small"
            pagination={false}
            columns={[
              { title: '供应商', dataIndex: 'provider', key: 'provider', width: 100, render: (v: string) => <Tag color="blue">{translateProvider(v)}</Tag> },
              { title: '模型', dataIndex: 'model', key: 'model', render: (v: string) => translateModelName(v) },
              { title: '调用次数', dataIndex: 'callCount', key: 'callCount', width: 90, align: 'center' },
              { title: 'Prompt', dataIndex: 'promptTokens', key: 'prompt', width: 100, align: 'right', render: (v: number) => formatTokenCount(v) },
              { title: 'Completion', dataIndex: 'completionTokens', key: 'completion', width: 100, align: 'right', render: (v: number) => formatTokenCount(v) },
              { title: '合计', dataIndex: 'totalTokens', key: 'total', width: 100, align: 'right', render: (v: number) => <Text strong>{formatTokenCount(v)}</Text> }
            ]}
          />
        </Card>
      )}

      <Title level={5}>参与玩家</Title>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {playerIds.map((pid) => (
          <Button key={pid} icon={<UserOutlined />} onClick={() => onOpenPlayer(pid)}>
            {getPlayerLabel ? getPlayerLabel(pid) : `${pid}号玩家`}
          </Button>
        ))}
      </div>
    </div>
  );
}
