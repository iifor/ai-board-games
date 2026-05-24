import React from 'react';
import { Descriptions, Drawer, Tag, Typography } from 'antd';
import { LlmCallCard } from '../../components/TraceComponents/LlmCallCard';
import { AgentDecisionCard } from '../../components/TraceComponents/AgentDecisionCard';
import { RelatedSection, RelationItem } from './TraceRelationList';
import { TraceJsonBlock } from './TraceJsonBlock';

const { Text, Title } = Typography;

function parseJson(value, fallback = {}) {
  try {
    return typeof value === 'string' ? JSON.parse(value) : (value || fallback);
  } catch {
    return fallback;
  }
}

export function TraceDetailDrawer({ detail, relations, onClose, onOpenDetail }) {
  const record = detail?.record;
  const spanContext = record?.span_id ? relations?.getSpanContext(record.span_id) : null;
  const currentSpanContext = detail?.type === 'span' ? relations?.getSpanContext(record?.id) : null;
  const titleMap = {
    span: 'Span 明细',
    llm: 'LLM 调用明细',
    decision: 'Agent 决策明细',
    snapshot: '状态快照明细',
    event: '事件明细'
  };

  return (
    <Drawer
      title={titleMap[detail?.type] || '明细'}
      width="min(860px, 88vw)"
      open={Boolean(detail)}
      onClose={onClose}
      destroyOnClose
      rootClassName="admin-trace-detail-drawer"
    >
      {detail?.type === 'span' && (
        <SpanDetail
          span={record}
          related={currentSpanContext}
          onOpenDetail={onOpenDetail}
        />
      )}
      {detail?.type === 'llm' && (
        <>
          <RelatedSpan span={spanContext?.span} onOpenDetail={onOpenDetail} />
          <LlmCallCard call={record} defaultCollapsed={false} />
        </>
      )}
      {detail?.type === 'decision' && (
        <>
          <RelatedSpan span={spanContext?.span} onOpenDetail={onOpenDetail} />
          <AgentDecisionCard decision={record} />
          <RelatedSection title="同 Span 下的 LLM 调用" emptyText="暂无关联 LLM 调用">
            {spanContext?.llmCalls?.map((call) => (
              <RelationItem
                key={call.id}
                title={call.model}
                tags={[call.provider, call.player_id ? `玩家 ${call.player_id}` : null]}
                onClick={() => onOpenDetail({ type: 'llm', record: call })}
              />
            ))}
          </RelatedSection>
          <RelatedSection title="同 Span 下的事件" emptyText="暂无关联事件">
            {spanContext?.events?.map((event) => (
              <RelationItem
                key={event.id}
                title={event.event_type}
                tags={[event.phase, event.day != null ? `Day ${event.day}` : null]}
                onClick={() => onOpenDetail({ type: 'event', record: event })}
              />
            ))}
          </RelatedSection>
        </>
      )}
      {detail?.type === 'snapshot' && (
        <TraceJsonBlock value={parseJson(record?.snapshot_json)} />
      )}
      {detail?.type === 'event' && (
        <TraceJsonBlock value={parseJson(record?.event_json)} />
      )}
    </Drawer>
  );
}

function SpanDetail({ span, related, onOpenDetail }) {
  if (!span) return null;
  const attrs = parseJson(span.attributes_json);
  const error = span.error_json ? parseJson(span.error_json, null) : null;

  return (
    <div>
      <Descriptions bordered size="small" column={1} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Span ID"><Text code>{span.id}</Text></Descriptions.Item>
        <Descriptions.Item label="名称">{span.span_name}</Descriptions.Item>
        <Descriptions.Item label="类型"><Tag>{span.span_type}</Tag></Descriptions.Item>
        <Descriptions.Item label="状态">{span.status}</Descriptions.Item>
        <Descriptions.Item label="开始时间">{span.start_time ? new Date(span.start_time).toLocaleString() : '-'}</Descriptions.Item>
        <Descriptions.Item label="结束时间">{span.end_time ? new Date(span.end_time).toLocaleString() : '-'}</Descriptions.Item>
      </Descriptions>
      <Title level={5}>Attributes</Title>
      <TraceJsonBlock value={attrs} />
      <RelatedSection title="关联 LLM 调用" emptyText="暂无关联 LLM 调用">
        {related?.llmCalls?.map((call) => (
          <RelationItem
            key={call.id}
            title={call.model}
            tags={[call.provider, call.player_id ? `玩家 ${call.player_id}` : null]}
            onClick={() => onOpenDetail({ type: 'llm', record: call })}
          />
        ))}
      </RelatedSection>
      <RelatedSection title="关联 Agent 决策" emptyText="暂无关联 Agent 决策">
        {related?.decisions?.map((decision) => (
          <RelationItem
            key={decision.id}
            title={decision.decision_type}
            tags={[decision.player_id ? `玩家 ${decision.player_id}` : null, decision.phase]}
            onClick={() => onOpenDetail({ type: 'decision', record: decision })}
          />
        ))}
      </RelatedSection>
      <RelatedSection title="关联事件" emptyText="暂无关联事件">
        {related?.events?.map((event) => (
          <RelationItem
            key={event.id}
            title={event.event_type}
            tags={[event.phase, event.day != null ? `Day ${event.day}` : null]}
            onClick={() => onOpenDetail({ type: 'event', record: event })}
          />
        ))}
      </RelatedSection>
      {error && (
        <>
          <Title level={5} style={{ marginTop: 16 }}>Error</Title>
          <TraceJsonBlock value={error} />
        </>
      )}
    </div>
  );
}

function RelatedSpan({ span, onOpenDetail }) {
  return (
    <RelatedSection title="所属 Span" emptyText="未记录所属 Span">
      {span && (
        <RelationItem
          title={span.span_name}
          tags={[span.span_type, span.status]}
          onClick={() => onOpenDetail({ type: 'span', record: span })}
        />
      )}
    </RelatedSection>
  );
}
