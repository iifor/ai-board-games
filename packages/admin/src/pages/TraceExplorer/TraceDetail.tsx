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

  const participantMap = new Map((trace?.participants || []).map((player) => [player.seatId, player]));
  const playerIds = trace?.participants?.length
    ? trace.participants.map((player) => player.seatId).sort((a, b) => a - b)
    : [...new Set([
        ...(llmCalls || []).map((call) => call.player_id),
        ...(decisions || []).map((decision) => decision.player_id),
      ].filter(Boolean) as number[])].sort((a, b) => a - b);
  const getTracePlayerLabel = (playerId: number | undefined | null): string => {
    if (!playerId) return '';
    const participant = participantMap.get(playerId);
    return participant
      ? `${participant.seatId}号-${participant.nickname}`
      : getPlayerLabel(playerId);
  };
  const getTraceNickname = (playerId: number | undefined | null): string => {
    if (!playerId) return '';
    return participantMap.get(playerId)?.nickname || getNickname(playerId);
  };
  const tokenSummary = getTraceTokenSummary(llmCalls);
  const relations = buildTraceRelations({ spans, llmCalls, decisions, events });
  const timelineRows = buildTraceTimeline({ spans, llmCalls, decisions, events, getNickname: getTraceNickname });

  // Reverse for newest-first display
  const reversedTimeline = [...timelineRows].reverse();
  const reversedLlmCalls = [...llmCalls].reverse();
  const reversedDecisions = [...decisions].reverse();
  const reversedSnapshots = [...snapshots].reverse();
  const reversedEvents = [...events].reverse();
  const errorEvents = events.filter((e) => e.event_type === 'ai-error');
  const reversedErrorEvents = [...errorEvents].reverse();
  const attentionRows = timelineRows.filter((row) => {
    if (row.type === 'event') {
      const record = row.record as TraceEvent;
      return record.event_type === 'werewolf_interaction_feedback' || record.event_type === 'ai-error';
    }
    if (row.type === 'decision') {
      const record = row.record as AgentDecision;
      return Boolean(record.fallback_used);
    }
    return false;
  });
  const reversedAttentionRows = [...attentionRows].reverse();

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
      children: <TraceOverview trace={trace!} tokenSummary={tokenSummary} playerIds={playerIds} onOpenPlayer={goPlayerTrace} getPlayerLabel={getTracePlayerLabel} />
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
      key: 'attention', label: `关键事件 (${attentionRows.length})`,
      children: <TraceTimelineTable rows={reversedAttentionRows} onOpenDetail={setDetailDrawer} />
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
                {call.player_id && <Tag color="cyan">{getTracePlayerLabel(call.player_id)}</Tag>}
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
                {dec.player_id && <Tag color="cyan">{getTracePlayerLabel(dec.player_id)}</Tag>}
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
      key: 'errors', label: `异常 (${errorEvents.length})`,
      children: (
        <Table
          className="admin-trace-table"
          dataSource={reversedErrorEvents} rowKey="id" size="small"
          columns={[
            { title: '异常原因', dataIndex: 'event_json', key: 'reason', width: 200, render: (json: string | Record<string, unknown>) => {
              const data = (typeof json === 'string' ? (() => { try { return JSON.parse(json) as Record<string, unknown>; } catch { return null; } })() : (json as Record<string, unknown> || null)) as Record<string, unknown> | null;
              const inner = (data?.event as Record<string, unknown> | undefined);
              return <Text type="danger">{String(inner?.reason || data?.reason || '未知')}</Text>;
            }},
            { title: '技能', key: 'skillId', width: 120, render: (_: unknown, record: TraceEvent) => {
              const data = (typeof record.event_json === 'string' ? (() => { try { return JSON.parse(record.event_json) as Record<string, unknown>; } catch { return null; } })() : (record.event_json as Record<string, unknown> || null)) as Record<string, unknown> | null;
              const inner = (data?.event as Record<string, unknown> | undefined);
              return <Tag>{String(inner?.skillId || data?.skillId || '-')}</Tag>;
            }},
            { title: '玩家', key: 'playerId', width: 100, render: (_: unknown, record: TraceEvent) => {
              const data = (typeof record.event_json === 'string' ? (() => { try { return JSON.parse(record.event_json) as Record<string, unknown>; } catch { return null; } })() : (record.event_json as Record<string, unknown> || null)) as Record<string, unknown> | null;
              const inner = (data?.event as Record<string, unknown> | undefined);
              const actorId = (inner?.actorId ?? data?.actorId) as number | undefined;
              return actorId != null ? <Tag color="cyan">{getTracePlayerLabel(Number(actorId))}</Tag> : <Text type="secondary">-</Text>;
            }},
            { title: 'Phase', dataIndex: 'phase', key: 'phase', width: 80 },
            { title: '时间', dataIndex: 'received_at', key: 'received_at', width: 180, render: (t: string) => t ? new Date(t).toLocaleString() : '-' }
          ]}
          pagination={false}
          scroll={{ x: 760, y: 'calc(100vh - 330px)' }}
          rowClassName="admin-trace-row"
          onRow={(record) => ({ onClick: () => setDetailDrawer({ type: 'event', record }) })}
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
        getNickname={getTracePlayerLabel}
      />
    </div>
  );
}
