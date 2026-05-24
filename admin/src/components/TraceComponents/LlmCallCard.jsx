import React, { useState } from 'react';
import { Card, Collapse, Descriptions, Tag, Typography } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';

const { Text, Paragraph } = Typography;

export function LlmCallCard({ call, defaultCollapsed = true }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  if (!call) return null;

  let messages = [];
  try {
    messages = typeof call.messages_json === 'string' ? JSON.parse(call.messages_json) : (call.messages_json || []);
  } catch { /* ignore */ }

  const isError = call.status === 'error';

  return (
    <Card
      size="small"
      style={{ marginBottom: 12 }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isError ? <CloseCircleOutlined style={{ color: '#ff4d4f' }} /> : <CheckCircleOutlined style={{ color: '#52c41a' }} />}
          <Tag color="blue">{call.provider}</Tag>
          <Text strong>{call.model}</Text>
          {call.player_id && <Tag>玩家 {call.player_id}</Tag>}
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
          <Text strong>Messages ({messages.length}):</Text>
          {messages.map((msg, i) => (
            <div key={i} style={{ marginTop: 8 }}>
              <Tag color={msg.role === 'system' ? 'red' : msg.role === 'user' ? 'blue' : 'green'}>{msg.role}</Tag>
              <pre style={{
                background: '#fafafa', padding: 8, borderRadius: 4, margin: '4px 0 0',
                maxHeight: 300, overflow: 'auto', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word'
              }}>
                {String(msg.content || '').slice(0, 2000)}
                {String(msg.content || '').length > 2000 ? '\n\n... (内容已截断)' : ''}
              </pre>
            </div>
          ))}

          {call.response_text && (
            <div style={{ marginTop: 12 }}>
              <Text strong>Response:</Text>
              <pre style={{
                background: '#f6ffed', padding: 8, borderRadius: 4, margin: '4px 0 0',
                maxHeight: 200, overflow: 'auto', fontSize: 12, whiteSpace: 'pre-wrap'
              }}>
                {call.response_text.slice(0, 1500)}
                {call.response_text.length > 1500 ? '\n\n... (内容已截断)' : ''}
              </pre>
            </div>
          )}

          {call.thinking_text && (
            <div style={{ marginTop: 12 }}>
              <Text strong>Thinking:</Text>
              <pre style={{
                background: '#fff7e6', padding: 8, borderRadius: 4, margin: '4px 0 0',
                maxHeight: 200, overflow: 'auto', fontSize: 12, whiteSpace: 'pre-wrap'
              }}>
                {call.thinking_text.slice(0, 1500)}
              </pre>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
