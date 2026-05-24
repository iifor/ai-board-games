import React from 'react';
import { Table, Tag, Typography } from 'antd';

const { Text } = Typography;
const STATUS_COLORS = { ok: 'success', error: 'error', fallback: 'warning' };

function buildSpanTree(spans) {
  const map = new Map();
  const roots = [];
  for (const span of spans) {
    map.set(span.id, { ...span, children: [] });
  }
  for (const span of spans) {
    const node = map.get(span.id);
    if (span.parent_span_id && map.has(span.parent_span_id)) {
      map.get(span.parent_span_id).children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function flattenTree(nodes, depth = 0) {
  const result = [];
  for (const node of nodes) {
    result.push({ ...node, depth });
    if (node.children && node.children.length) {
      result.push(...flattenTree(node.children, depth + 1));
    }
  }
  return result;
}

const SPAN_TYPE_LABELS = {
  'game-root': '游戏根',
  'llm-call': 'LLM 调用',
  'agent-decision': 'Agent 决策',
  'phase': '阶段',
  'skill-execution': '技能执行'
};

export function SpanTimeline({ spans = [] }) {
  const tree = buildSpanTree(spans);
  const flat = flattenTree(tree);

  if (!flat.length) return <Text type="secondary">暂无 Span 数据</Text>;

  return (
    <Table
      dataSource={flat} rowKey="id" size="small"
      columns={[
        {
          title: '名称', dataIndex: 'span_name', key: 'name',
          render: (name, record) => (
            <span style={{ paddingLeft: record.depth * 20 }}>
              {record.depth > 0 && '└ '}
              <Text code style={{ fontSize: 12 }}>{name}</Text>
            </span>
          )
        },
        {
          title: '类型', dataIndex: 'span_type', key: 'type', width: 100,
          render: (t) => <Tag>{SPAN_TYPE_LABELS[t] || t}</Tag>
        },
        {
          title: '状态', dataIndex: 'status', key: 'status', width: 80,
          render: (s) => <Tag color={STATUS_COLORS[s] || 'default'}>{s}</Tag>
        },
        {
          title: '开始', dataIndex: 'start_time', key: 'start', width: 180,
          render: (t) => t ? new Date(t).toLocaleString() : '-'
        },
        {
          title: '耗时', key: 'duration', width: 80,
          render: (_, record) => {
            if (!record.start_time || !record.end_time) return '-';
            const ms = new Date(record.end_time) - new Date(record.start_time);
            return ms ? `${ms}ms` : '<1ms';
          }
        }
      ]}
      pagination={false}
      expandable={{
        expandedRowRender: (record) => {
          let attrs = {};
          let error = null;
          try { attrs = typeof record.attributes_json === 'string' ? JSON.parse(record.attributes_json) : (record.attributes_json || {}); } catch { /* ignore */ }
          try { error = record.error_json ? (typeof record.error_json === 'string' ? JSON.parse(record.error_json) : record.error_json) : null; } catch { /* ignore */ }
          return (
            <div>
              {Object.keys(attrs).length > 0 && (
                <pre style={{ fontSize: 11, background: '#fafafa', padding: 8, borderRadius: 4 }}>
                  {JSON.stringify(attrs, null, 2)}
                </pre>
              )}
              {error && (
                <pre style={{ fontSize: 11, color: '#ff4d4f', background: '#fff2f0', padding: 8, borderRadius: 4, marginTop: 8 }}>
                  {JSON.stringify(error, null, 2)}
                </pre>
              )}
            </div>
          );
        }
      }}
    />
  );
}
