import { Table, Tag, Typography } from 'antd';
import type { Span } from '../../types/trace';

const { Text } = Typography;
const STATUS_COLORS: Record<string, string> = { ok: 'success', error: 'error', fallback: 'warning' };

interface SpanNode extends Span {
  children: SpanNode[];
}

interface FlatSpan extends Span {
  depth: number;
  children: SpanNode[];
}

function buildSpanTree(spans: Span[]): SpanNode[] {
  const map = new Map<string, SpanNode>();
  const roots: SpanNode[] = [];
  for (const span of spans) {
    map.set(span.id, { ...span, children: [] });
  }
  for (const span of spans) {
    const node = map.get(span.id)!;
    if (span.parent_span_id && map.has(span.parent_span_id)) {
      map.get(span.parent_span_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function flattenTree(nodes: SpanNode[], depth = 0): FlatSpan[] {
  const result: FlatSpan[] = [];
  for (const node of nodes) {
    result.push({ ...node, depth });
    if (node.children && node.children.length) {
      result.push(...flattenTree(node.children, depth + 1));
    }
  }
  return result;
}

const SPAN_TYPE_LABELS: Record<string, string> = {
  'game-root': '游戏根',
  'llm-call': 'LLM 调用',
  'agent-decision': 'Agent 决策',
  'phase': '阶段',
  'skill-execution': '技能执行'
};

interface SpanTimelineProps {
  spans?: Span[];
  onSelectSpan?: (span: Span) => void;
}

export function SpanTimeline({ spans = [], onSelectSpan }: SpanTimelineProps) {
  const tree = buildSpanTree(spans);
  const flat = flattenTree(tree);

  if (!flat.length) return <Text type="secondary">暂无 Span 数据</Text>;

  return (
    <Table
      className="admin-trace-table"
      dataSource={flat} rowKey="id" size="small"
      columns={[
        {
          title: '名称', dataIndex: 'span_name', key: 'name',
          render: (name: string, record: FlatSpan) => (
            <span style={{ paddingLeft: record.depth * 20 }}>
              {record.depth > 0 && '└ '}
              <Text code style={{ fontSize: 12 }}>{name}</Text>
            </span>
          )
        },
        {
          title: '类型', dataIndex: 'span_type', key: 'type', width: 100,
          render: (t: string) => <Tag>{SPAN_TYPE_LABELS[t] || t}</Tag>
        },
        {
          title: '状态', dataIndex: 'status', key: 'status', width: 80,
          render: (s: string) => <Tag color={STATUS_COLORS[s] || 'default'}>{s}</Tag>
        },
        {
          title: '开始', dataIndex: 'start_time', key: 'start', width: 180,
          render: (t: string) => t ? new Date(t).toLocaleString() : '-'
        },
        {
          title: '耗时', key: 'duration', width: 80,
          render: (_: unknown, record: FlatSpan) => {
            if (!record.start_time || !record.end_time) return '-';
            const ms = new Date(record.end_time).getTime() - new Date(record.start_time).getTime();
            return ms ? `${ms}ms` : '<1ms';
          }
        }
      ]}
      pagination={false}
      scroll={{ x: 760, y: 'calc(100vh - 330px)' }}
      rowClassName={onSelectSpan ? 'admin-trace-row' : ''}
      onRow={(record) => ({
        onClick: () => {
          if (onSelectSpan) onSelectSpan(record);
        }
      })}
    />
  );
}
