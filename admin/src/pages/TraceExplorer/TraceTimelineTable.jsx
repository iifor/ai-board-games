import React from 'react';
import { Table, Tag } from 'antd';

const TIMELINE_TYPE_META = {
  span: { label: 'Span', color: 'geekblue' },
  llm: { label: 'LLM', color: 'blue' },
  decision: { label: '决策', color: 'purple' },
  event: { label: '事件', color: 'green' }
};

export function TraceTimelineTable({ rows = [], onOpenDetail }) {
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
          render: (type) => {
            const meta = TIMELINE_TYPE_META[type] || { label: type, color: 'default' };
            return <Tag color={meta.color}>{meta.label}</Tag>;
          }
        },
        { title: '时间', dataIndex: 'time', key: 'time', width: 180, render: (t) => t ? new Date(t).toLocaleString() : '-' },
        { title: '名称', dataIndex: 'title', key: 'title' },
        { title: '说明', dataIndex: 'description', key: 'description', width: 180, render: (value) => value || '-' }
      ]}
      pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: [15, 20] }}
      scroll={{ x: 820, y: 'calc(100vh - 360px)' }}
      rowClassName={(record) => `admin-trace-row admin-trace-timeline-row is-${record.type}`}
      onRow={(record) => ({ onClick: () => onOpenDetail({ type: record.type, record: record.record }) })}
    />
  );
}
