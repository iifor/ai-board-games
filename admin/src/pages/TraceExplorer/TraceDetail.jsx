import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Descriptions, Table, Tabs, Tag, Typography } from 'antd';
import { ArrowLeftOutlined, UserOutlined } from '@ant-design/icons';
import { adminRequest } from '../../services/adminApi';
import { GAME_LABELS } from '../../constants/adminConstants';
import { SpanTimeline } from '../../components/TraceComponents/SpanTimeline';
import { LlmCallCard } from '../../components/TraceComponents/LlmCallCard';
import { AgentDecisionCard } from '../../components/TraceComponents/AgentDecisionCard';

const { Title, Text } = Typography;

const STATUS_COLORS = { recording: 'processing', completed: 'success', error: 'error' };
const STATUS_MAP = { recording: '进行中', completed: '已完成', error: '错误' };

export function TraceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [trace, setTrace] = useState(null);
  const [spans, setSpans] = useState([]);
  const [llmCalls, setLlmCalls] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [t, l, d, sn, e] = await Promise.all([
          adminRequest(`/traces/${id}`),
          adminRequest(`/traces/${id}/llm`),
          adminRequest(`/traces/${id}/decisions`),
          adminRequest(`/traces/${id}/snapshots`),
          adminRequest(`/traces/${id}/events`),
        ].map((p) => p.catch(() => null)));
        setTrace(t);
        setSpans(Array.isArray(t?.spans) ? t.spans : []);
        setLlmCalls(Array.isArray(l) ? l : []);
        setDecisions(Array.isArray(d) ? d : []);
        setSnapshots(Array.isArray(sn) ? sn : []);
        setEvents(Array.isArray(e) ? e : []);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, [id]);

  // Extract unique player IDs from decisions
  const playerIds = [...new Set((decisions || []).map((d) => d.player_id).filter(Boolean))].sort((a, b) => a - b);

  const tabItems = [
    {
      key: 'overview', label: '概览',
      children: (
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
              <Button
                key={pid} icon={<UserOutlined />}
                onClick={() => navigate(`/traces/${id}/player/${pid}`)}
              >
                {pid} 号玩家
              </Button>
            ))}
          </div>
        </div>
      )
    },
    {
      key: 'spans', label: `Span 层级 (${spans.length})`,
      children: <SpanTimeline spans={spans} />
    },
    {
      key: 'llm', label: `LLM 调用 (${llmCalls.length})`,
      children: (
        <div>
          {llmCalls.map((call) => (
            <LlmCallCard key={call.id} call={call} />
          ))}
          {!llmCalls.length && <Text type="secondary">暂无 LLM 调用记录</Text>}
        </div>
      )
    },
    {
      key: 'decisions', label: `Agent 决策 (${decisions.length})`,
      children: (
        <div>
          {decisions.map((dec) => (
            <AgentDecisionCard key={dec.id} decision={dec} />
          ))}
          {!decisions.length && <Text type="secondary">暂无 Agent 决策记录</Text>}
        </div>
      )
    },
    {
      key: 'snapshots', label: `状态快照 (${snapshots.length})`,
      children: (
        <Table
          dataSource={snapshots} rowKey="id" size="small"
          columns={[
            { title: '检查点', dataIndex: 'checkpoint', key: 'checkpoint' },
            { title: 'Day', dataIndex: 'day', key: 'day', width: 60 },
            { title: 'Phase', dataIndex: 'phase', key: 'phase', width: 100 },
            { title: '玩家数', dataIndex: 'player_count', key: 'player_count', width: 80 },
            { title: '存活', dataIndex: 'alive_count', key: 'alive_count', width: 80 },
            { title: '时间', dataIndex: 'created_at', key: 'created_at', width: 180, render: (t) => t ? new Date(t).toLocaleString() : '-' }
          ]}
        />
      )
    },
    {
      key: 'events', label: `事件流 (${events.length})`,
      children: (
        <Table
          dataSource={events} rowKey="id" size="small"
          columns={[
            { title: '类型', dataIndex: 'event_type', key: 'event_type', width: 140, render: (t) => <Tag>{t}</Tag> },
            { title: 'Phase', dataIndex: 'phase', key: 'phase', width: 80 },
            { title: 'Day', dataIndex: 'day', key: 'day', width: 60 },
            { title: '时间', dataIndex: 'received_at', key: 'received_at', width: 180, render: (t) => t ? new Date(t).toLocaleString() : '-' }
          ]}
          expandable={{
            expandedRowRender: (record) => {
              try {
                const obj = typeof record.event_json === 'string' ? JSON.parse(record.event_json) : record.event_json;
                return <pre style={{ maxHeight: 400, overflow: 'auto', fontSize: 12 }}>{JSON.stringify(obj, null, 2)}</pre>;
              } catch { return <Text type="secondary">无法解析</Text>; }
            }
          }}
        />
      )
    }
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/traces')}>返回</Button>
        <Title level={4} style={{ margin: 0 }}>Trace 详情</Title>
      </div>
      <Card loading={loading}>
        <Tabs items={tabItems} />
      </Card>
    </div>
  );
}
