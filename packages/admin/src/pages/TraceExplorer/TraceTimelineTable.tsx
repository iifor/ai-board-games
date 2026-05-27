import { Table, Tag, Typography } from 'antd';
import type { TimelineRow, DetailDrawerState } from '../../types/trace';

const { Text } = Typography;

const TIMELINE_TYPE_META: Record<string, { label: string; color: string }> = {
  span: { label: 'Span', color: 'geekblue' },
  llm: { label: 'LLM 调用', color: 'blue' },
  decision: { label: 'Agent 决策', color: 'purple' },
  event: { label: '游戏事件', color: 'green' }
};

interface TraceTimelineTableProps {
  rows?: TimelineRow[];
  onOpenDetail: (detail: DetailDrawerState) => void;
}

export function TraceTimelineTable({ rows = [], onOpenDetail }: TraceTimelineTableProps) {
  return (
    <Table
      className="admin-trace-table"
      dataSource={rows}
      rowKey="id"
      size="small"
      columns={[
        {
          title: '类型',
          dataIndex: 'type',
          key: 'type',
          width: 90,
          render: (type: string) => {
            const meta = TIMELINE_TYPE_META[type] || { label: type, color: 'default' };
            return <Tag color={meta.color}>{meta.label}</Tag>;
          }
        },
        { title: '时间', dataIndex: 'time', key: 'time', width: 180, render: (t: string) => t ? new Date(t).toLocaleString() : '-' },
        { title: '名称', dataIndex: 'title', key: 'title', width: 200 },
        { title: '阶段', dataIndex: 'phase', key: 'phase', width: 100, render: (v: string) => v || '-' },
        { title: '说明', dataIndex: 'description', key: 'description', width: 160, render: (value: string) => value || '-' },
        { title: '详情', dataIndex: 'detail', key: 'detail', width: 200, ellipsis: true, render: (v: string) => v ? <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> : '-' }
      ]}
      pagination={false}
      scroll={{ x: 1000, y: 'calc(100vh - 330px)' }}
      rowClassName={(record) => `admin-trace-row admin-trace-timeline-row is-${record.type}`}
      onRow={(record) => ({ onClick: () => onOpenDetail({ type: record.type, record: record.record }) })}
    />
  );
}
