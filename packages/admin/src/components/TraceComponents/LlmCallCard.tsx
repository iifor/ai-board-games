import { useState } from 'react';
import { Card, Descriptions, Tag, Typography } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { translateProvider, translateModelName } from '../../constants/traceLabels';
import type { LlmCall } from '../../types/trace';

const { Text } = Typography;

type GetNickname = (playerId: number | undefined | null) => string;

interface LlmCallCardProps {
  call: LlmCall;
  defaultCollapsed?: boolean;
  getNickname?: GetNickname;
}

interface LlmMessage {
  role: string;
  content: string;
}

export function LlmCallCard({ call, defaultCollapsed = true, getNickname }: LlmCallCardProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  if (!call) return null;

  let messages: LlmMessage[] = [];
  try {
    messages = typeof call.messages_json === 'string' ? JSON.parse(call.messages_json) as LlmMessage[] : (call.messages_json as LlmMessage[] || []);
  } catch { /* ignore */ }

  const isError = call.status === 'error';

  return (
    <Card
      size="small"
      style={{ marginBottom: 12 }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isError ? <CloseCircleOutlined style={{ color: '#ff4d4f' }} /> : <CheckCircleOutlined style={{ color: '#52c41a' }} />}
          {call.player_id && <Tag color="cyan">{getNickname?.(call.player_id) || `玩家 ${call.player_id}`}</Tag>}
          <Tag color="blue">{translateProvider(call.provider)}</Tag>
          <Text strong>{translateModelName(call.model)}</Text>
          {call.player_role && <Tag>{call.player_role}</Tag>}
          <Text type="secondary" style={{ fontSize: 12 }}>{call.latency_ms}ms</Text>
          {isError && <Text type="danger" style={{ fontSize: 12 }}>{call.error_message}</Text>}
        </div>
      }
      extra={
        <span style={{ cursor: 'pointer', fontSize: 12, color: '#1677ff' }} onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? '展开' : '收起'}
        </span>
      }
    >
      <Descriptions size="small" column={4}>
        <Descriptions.Item label="Tokens">{call.prompt_tokens ?? '-'} + {call.completion_tokens ?? '-'}</Descriptions.Item>
        <Descriptions.Item label="延迟">{call.latency_ms}ms</Descriptions.Item>
        <Descriptions.Item label="格式">{call.api_format}</Descriptions.Item>
        <Descriptions.Item label="温度">{call.temperature ?? '-'}</Descriptions.Item>
      </Descriptions>

      {!collapsed && (
        <div style={{ marginTop: 12 }}>
          {call.response_text && (
            <div style={{ marginBottom: 12 }}>
              <Text strong>Response:</Text>
              <pre style={{
                background: '#f6ffed', padding: 8, borderRadius: 4, margin: '4px 0 0',
                maxHeight: 200, overflow: 'auto', fontSize: 12, whiteSpace: 'pre-wrap'
              }}>
                {call.response_text}
              </pre>
            </div>
          )}

          {call.thinking_text && (
            <div style={{ marginBottom: 12 }}>
              <Text strong>Thinking:</Text>
              <pre style={{
                background: '#fff7e6', padding: 8, borderRadius: 4, margin: '4px 0 0',
                fontSize: 12, whiteSpace: 'pre-wrap'
              }}>
                {call.thinking_text}
              </pre>
            </div>
          )}

          <Text strong>Messages ({messages.length})，最新在前:</Text>
          {[...messages].reverse().map((msg, i) => (
            <div key={i} style={{ marginTop: 8 }}>
              <Tag color={msg.role === 'system' ? 'red' : msg.role === 'user' ? 'blue' : 'green'}>{msg.role}</Tag>
              <pre style={{
                background: '#fafafa', padding: 8, borderRadius: 4, margin: '4px 0 0',
                fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word'
              }}>
                {String(msg.content || '')}
              </pre>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
