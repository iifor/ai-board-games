import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Space, Table, Tabs, Tag, Typography } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { adminRequest } from '../../services/adminApi';
import { SpanTimeline } from '../../components/TraceComponents/SpanTimeline';
import { formatTokenCount, getTraceTokenSummary } from './traceMetrics';
import { buildTraceRelations, buildTraceTimeline } from './traceRelations';
import { TraceDetailDrawer } from './TraceDetailDrawer';
import { TraceOverview } from './TraceOverview';
import { TraceTimelineTable } from './TraceTimelineTable';

const { Title, Text } = Typography;

export function TraceDetail({ traceId, embedded = false, onClose }) {
  const { id: routeId } = useParams();
  const id = traceId || routeId;
  const navigate = useNavigate();
  const [trace, setTrace] = useState(null);
  const [spans, setSpans] = useState([]);
  const [llmCalls, setLlmCalls] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailDrawer, setDetailDrawer] = useState(null);

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
  const tokenSummary = getTraceTokenSummary(llmCalls);
  const relations = buildTraceRelations({ spans, llmCalls, decisions, events });
  const timelineRows = buildTraceTimeline({ spans, llmCalls, decisions, events });
  const goBack = () => {
    if (embedded && onClose) {
      onClose();
      return;
    }
    navigate('/traces');
  };
  const goPlayerTrace = (playerId) => {
    if (embedded && onClose) onClose();
    navigate(`/traces/${id}/player/${playerId}`);
  };

  const tabItems = [
    {
      key: 'overview', label: '概览',
      children: <TraceOverview trace={trace} tokenSummary={tokenSummary} playerIds={playerIds} onOpenPlayer={goPlayerTrace} />
    },
    {
      key: 'spans', label: `Span 层级 (${spans.length})`,
      children: <SpanTimeline spans={spans} onSelectSpan={(record) => setDetailDrawer({ type: 'span', record })} />
    },
    {
      key: 'timeline', label: `时间线 (${timelineRows.length})`,
      children: <TraceTimelineTable rows={timelineRows} onOpenDetail={setDetailDrawer} />
    },
    {
      key: 'llm', label: `LLM 调用 (${llmCalls.length})`,
      children: (
        <div className="admin-trace-card-list">
          {llmCalls.map((call) => (
            <Card
              key={call.id}
              size="small"
              className="admin-trace-click-card"
              onClick={() => setDetailDrawer({ type: 'llm', record: call })}
            >
              <Space wrap>
                <Tag color={call.status === 'error' ? 'red' : 'blue'}>{call.provider}</Tag>
                <Text strong>{call.model}</Text>
                {call.player_id && <Tag>玩家 {call.player_id}</Tag>}
                <Text type="secondary">{call.latency_ms}ms</Text>
                <Text type="secondary">
                  Tokens: {formatTokenCount((Number(call.prompt_tokens) || 0) + (Number(call.completion_tokens) || 0))}
                </Text>
              </Space>
            </Card>
          ))}
          {!llmCalls.length && <Text type="secondary">暂无 LLM 调用记录</Text>}
        </div>
      )
    },
    {
      key: 'decisions', label: `Agent 决策 (${decisions.length})`,
      children: (
        <div className="admin-trace-card-list">
          {decisions.map((dec) => (
            <Card
              key={dec.id}
              size="small"
              className="admin-trace-click-card"
              onClick={() => setDetailDrawer({ type: 'decision', record: dec })}
            >
              <Space wrap>
                <Tag color="purple">{dec.decision_type}</Tag>
                {dec.player_id && <Tag>玩家 {dec.player_id}</Tag>}
                {dec.player_role && <Tag color="blue">{dec.player_role}</Tag>}
                {dec.phase && <Tag>{dec.phase}</Tag>}
                {dec.day != null && <Text type="secondary">Day {dec.day}</Text>}
                {dec.fallback_used ? <Tag color="orange">回退</Tag> : null}
              </Space>
            </Card>
          ))}
          {!decisions.length && <Text type="secondary">暂无 Agent 决策记录</Text>}
        </div>
      )
    },
    {
      key: 'snapshots', label: `状态快照 (${snapshots.length})`,
      children: (
        <Table
          className="admin-trace-table"
          dataSource={snapshots} rowKey="id" size="small"
          columns={[
            { title: '检查点', dataIndex: 'checkpoint', key: 'checkpoint' },
            { title: 'Day', dataIndex: 'day', key: 'day', width: 60 },
            { title: 'Phase', dataIndex: 'phase', key: 'phase', width: 100 },
            { title: '玩家数', dataIndex: 'player_count', key: 'player_count', width: 80 },
            { title: '存活', dataIndex: 'alive_count', key: 'alive_count', width: 80 },
            { title: '时间', dataIndex: 'created_at', key: 'created_at', width: 180, render: (t) => t ? new Date(t).toLocaleString() : '-' }
          ]}
          pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [15, 20] }}
          scroll={{ x: 760, y: 'calc(100vh - 360px)' }}
          rowClassName="admin-trace-row"
          onRow={(record) => ({ onClick: () => setDetailDrawer({ type: 'snapshot', record }) })}
        />
      )
    },
    {
      key: 'events', label: `事件流 (${events.length})`,
      children: (
        <Table
          className="admin-trace-table"
          dataSource={events} rowKey="id" size="small"
          columns={[
            { title: '类型', dataIndex: 'event_type', key: 'event_type', width: 140, render: (t) => <Tag>{t}</Tag> },
            { title: 'Phase', dataIndex: 'phase', key: 'phase', width: 80 },
            { title: 'Day', dataIndex: 'day', key: 'day', width: 60 },
            { title: '时间', dataIndex: 'received_at', key: 'received_at', width: 180, render: (t) => t ? new Date(t).toLocaleString() : '-' }
          ]}
          pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [15, 20] }}
          scroll={{ x: 760, y: 'calc(100vh - 360px)' }}
          rowClassName="admin-trace-row"
          onRow={(record) => ({ onClick: () => setDetailDrawer({ type: 'event', record }) })}
        />
      )
    }
  ];

  return (
    <div className={`admin-trace-detail${embedded ? ' is-drawer' : ''}`}>
      {!embedded && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={goBack}>返回</Button>
          <Title level={4} style={{ margin: 0 }}>Trace 详情</Title>
        </div>
      )}
      <Card className="admin-trace-detail-card" loading={loading} bordered={!embedded}>
        <Tabs items={tabItems} />
      </Card>
      <TraceDetailDrawer
        detail={detailDrawer}
        relations={relations}
        onClose={() => setDetailDrawer(null)}
        onOpenDetail={setDetailDrawer}
      />
    </div>
  );
}
