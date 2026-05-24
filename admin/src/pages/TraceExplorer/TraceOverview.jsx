import React from 'react';
import { Button, Descriptions, Tag, Typography } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { GAME_LABELS } from '../../constants/adminConstants';
import { formatTokenCount } from './traceMetrics';

const { Text, Title } = Typography;
const STATUS_COLORS = { recording: 'processing', completed: 'success', error: 'error' };
const STATUS_MAP = { recording: '进行中', completed: '已完成', error: '错误' };

export function TraceOverview({ trace, tokenSummary, playerIds = [], onOpenPlayer }) {
  return (
    <div>
      {trace && (
        <Descriptions bordered size="small" column={2} style={{ marginBottom: 24 }}>
          <Descriptions.Item label="Trace ID"><Text code>{trace.id}</Text></Descriptions.Item>
          <Descriptions.Item label="游戏类型"><Tag>{GAME_LABELS[trace.game_type] || trace.game_type}</Tag></Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag color={STATUS_COLORS[trace.status] || 'default'}>{STATUS_MAP[trace.status] || trace.status}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="耗时">{trace.duration_ms ? `${(trace.duration_ms / 1000).toFixed(1)}s` : '-'}</Descriptions.Item>
          <Descriptions.Item label="LLM 调用">{trace.llm_call_count}</Descriptions.Item>
          <Descriptions.Item label="Agent 决策">{trace.agent_decision_count}</Descriptions.Item>
          <Descriptions.Item label="游戏事件">{trace.event_count}</Descriptions.Item>
          <Descriptions.Item label="总 Token 消耗">{formatTokenCount(tokenSummary.totalTokens)}</Descriptions.Item>
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

      <Title level={5}>参与玩家</Title>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {playerIds.map((pid) => (
          <Button key={pid} icon={<UserOutlined />} onClick={() => onOpenPlayer(pid)}>
            {pid} 号玩家
          </Button>
        ))}
      </div>
    </div>
  );
}
