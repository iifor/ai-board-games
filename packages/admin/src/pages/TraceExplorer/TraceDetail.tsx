import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Space, Table, Tabs, Tag, Typography } from 'antd';
import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons';
import { adminRequest } from '../../services/adminApi';
import { SpanTimeline } from '../../components/TraceComponents/SpanTimeline';
import { formatTokenCount, getTraceTokenSummary } from './traceMetrics';
import { buildTraceRelations, buildTraceTimeline } from './traceRelations';
import { translateEventTitle, translateDecisionType, translateModelName, translateProvider } from '../../constants/traceLabels';
import { usePlayerNicknames } from '../../hooks/usePlayerNicknames';
import { TraceDetailDrawer } from './TraceDetailDrawer';
import { TraceOverview } from './TraceOverview';
import { TraceTimelineTable } from './TraceTimelineTable';
import type { Trace, Span, LlmCall, AgentDecision, TraceSnapshot, TraceEvent, DetailDrawerState } from '../../types/trace';

const { Title, Text } = Typography;

interface TraceDetailProps {
  traceId?: string;
  embedded?: boolean;
  onClose?: () => void;
}

export function TraceDetail({ traceId, embedded = false, onClose }: TraceDetailProps) {
  const { id: routeId } = useParams();
  const id = traceId || routeId;
  const navigate = useNavigate();
  const [trace, setTrace] = useState<Trace | null>(null);
  const [spans, setSpans] = useState<Span[]>([]);
  const [llmCalls, setLlmCalls] = useState<LlmCall[]>([]);
  const [decisions, setDecisions] = useState<AgentDecision[]>([]);
  const [snapshots, setSnapshots] = useState<TraceSnapshot[]>([]);
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detailDrawer, setDetailDrawer] = useState<DetailDrawerState | null>(null);

  const { getNickname, getPlayerLabel } = usePlayerNicknames();

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const results = await Promise.all([
        adminRequest<Trace>(`/traces/${id}`).catch(() => null),
        adminRequest<LlmCall[]>(`/traces/${id}/llm`).catch(() => null),
        adminRequest<AgentDecision[]>(`/traces/${id}/decisions`).catch(() => null),
        adminRequest<TraceSnapshot[]>(`/traces/${id}/snapshots`).catch(() => null),
        adminRequest<TraceEvent[]>(`/traces/${id}/events`).catch(() => null),
      ]);
      const [t, l, d, sn, e] = results;
      setTrace(t);
      setSpans(Array.isArray(t?.spans) ? t.spans : []);
      setLlmCalls(Array.isArray(l) ? l : []);
      setDecisions(Array.isArray(d) ? d : []);
      setSnapshots(Array.isArray(sn) ? sn : []);
      setEvents(Array.isArray(e) ? e : []);
    } catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleRefresh = () => fetchAll(true);

  const playerIds = [...new Set((decisions || []).map((d) => d.player_id).filter(Boolean) as number[])].sort((a, b) => a - b);
  const tokenSummary = getTraceTokenSummary(llmCalls);
  const relations = buildTraceRelations({ spans, llmCalls, decisions, events });
  const timelineRows = buildTraceTimeline({ spans, llmCalls, decisions, events, getNickname });

  // Reverse for newest-first display
  const reversedTimeline = [...timelineRows].reverse();
  const reversedLlmCalls = [...llmCalls].reverse();
  const reversedDecisions = [...decisions].reverse();
  const reversedSnapshots = [...snapshots].reverse();
  const reversedEvents = [...events].reverse();

  const goBack = () => {
    if (embedded && onClose) { onClose(); return; }
    navigate('/traces');
  };
  const goPlayerTrace = (playerId: number) => {
    if (embedded && onClose) onClose();
    navigate(`/traces/${id}/player/${playerId}`);
  };

  const tabItems = [
    {
      key: 'overview', label: '概览',
      children: <TraceOverview trace={trace!} tokenSummary={tokenSummary} playerIds={playerIds} onOpenPlayer={goPlayerTrace} getPlayerLabel={getPlayerLabel} />
    },
    {
      key: 'spans', label: `Span 层级 (${spans.length})`,
      children: <SpanTimeline spans={spans} onSelectSpan={(record) => setDetailDrawer({ type: 'span', record })} />
    },
    {
      key: 'timeline', label: `时间线 (${timelineRows.length})`,
      children: <TraceTimelineTable rows={reversedTimeline} onOpenDetail={setDetailDrawer} />
    },
    {
      key: 'llm', label: `LLM 调用 (${llmCalls.length})`,
      children: (
        <div className="admin-trace-card-list">
          {reversedLlmCalls.map((call) => (
            <Card
              key={call.id}
              size="small"
              className="admin-trace-click-card"
              onClick={() => setDetailDrawer({ type: 'llm', record: call })}
            >
              <Space wrap>
                {call.player_id && <Tag color="cyan">{getPlayerLabel(call.player_id)}</Tag>}
                <Tag color={call.status === 'error' ? 'red' : 'blue'}>{translateProvider(call.provider)}</Tag>
                <Text strong>{translateModelName(call.model)}</Text>
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
          {reversedDecisions.map((dec) => (
            <Card
              key={dec.id}
              size="small"
              className="admin-trace-click-card"
              onClick={() => setDetailDrawer({ type: 'decision', record: dec })}
            >
              <Space wrap>
                {dec.player_id && <Tag color="cyan">{getPlayerLabel(dec.player_id)}</Tag>}
                <Tag color="purple">{translateDecisionType(dec.decision_type)}</Tag>
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
          dataSource={reversedSnapshots} rowKey="id" size="small"
          columns={[
            { title: '检查点', dataIndex: 'checkpoint', key: 'checkpoint' },
            { title: 'Day', dataIndex: 'day', key: 'day', width: 60 },
            { title: 'Phase', dataIndex: 'phase', key: 'phase', width: 100 },
            { title: '玩家数', dataIndex: 'player_count', key: 'player_count', width: 80 },
            { title: '存活', dataIndex: 'alive_count', key: 'alive_count', width: 80 },
            { title: '时间', dataIndex: 'created_at', key: 'created_at', width: 180, render: (t: string) => t ? new Date(t).toLocaleString() : '-' }
          ]}
          pagination={false}
          scroll={{ x: 760, y: 'calc(100vh - 330px)' }}
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
          dataSource={reversedEvents} rowKey="id" size="small"
          columns={[
            { title: '类型', dataIndex: 'event_type', key: 'event_type', width: 200, render: (t: string, record: TraceEvent) => {
              const payload = typeof record.event_json === 'string' ? (() => { try { return JSON.parse(record.event_json) as Record<string, unknown>; } catch { return null; } })() : (record.event_json as Record<string, unknown> || null);
              return <Tag>{translateEventTitle(t, payload)}</Tag>;
            }},
            { title: 'Phase', dataIndex: 'phase', key: 'phase', width: 80 },
            { title: 'Day', dataIndex: 'day', key: 'day', width: 60 },
            { title: '时间', dataIndex: 'received_at', key: 'received_at', width: 180, render: (t: string) => t ? new Date(t).toLocaleString() : '-' }
          ]}
          pagination={false}
          scroll={{ x: 760, y: 'calc(100vh - 330px)' }}
          rowClassName="admin-trace-row"
          onRow={(record) => ({ onClick: () => setDetailDrawer({ type: 'event', record }) })}
        />
      )
    }
  ];

  return (
    <div className={`admin-trace-detail${embedded ? ' is-drawer' : ''}`}>
      <div className="admin-trace-detail-header">
        <Space>
          {!embedded && <Button icon={<ArrowLeftOutlined />} onClick={goBack}>返回</Button>}
          <Title level={4} style={{ margin: 0 }}>Trace 详情</Title>
        </Space>
        <Button icon={<ReloadOutlined />} loading={refreshing} onClick={handleRefresh}>刷新</Button>
      </div>
      <Card className="admin-trace-detail-card" loading={loading && !refreshing} bordered={!embedded}>
        <Tabs items={tabItems} />
      </Card>
      <TraceDetailDrawer
        detail={detailDrawer}
        relations={relations}
        onClose={() => setDetailDrawer(null)}
        onOpenDetail={setDetailDrawer}
        getNickname={getPlayerLabel}
      />
    </div>
  );
}
