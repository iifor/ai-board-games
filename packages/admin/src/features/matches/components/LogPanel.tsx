import { Select, Space, Switch, Table, Tag } from 'antd';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { LogEntryDto } from '../../../services/matches';
import { channelColor, describeLog } from '../utils';

/** 完整日志（含私密、阵营与 host 频道），可按频道筛选、只看兜底 */
export function LogPanel({ log, matchId, focusSeq }: { readonly log: readonly LogEntryDto[]; readonly matchId: string | null; readonly focusSeq?: number }) {
  const [channel, setChannel] = useState<string | null>(null);
  const [fallbackOnly, setFallbackOnly] = useState(false);
  const channels = useMemo(() => [...new Set(log.map((entry) => entry.channel))].sort(), [log]);
  const [focused, setFocused] = useState(!!focusSeq);
  const shown = log.filter((entry) => (!focused || entry.seq === focusSeq) && (!channel || entry.channel === channel) && (!fallbackOnly || entry.kind === 'fallback'));
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Space wrap>
        {focused && <button type="button" onClick={() => setFocused(false)}>事件 #{focusSeq} · 查看全部</button>}
        <Select allowClear placeholder="全部频道" style={{ width: 180 }} value={channel} onChange={(value) => setChannel(value ?? null)}
          options={channels.map((value) => ({ value, label: value }))} />
        <label><Switch size="small" checked={fallbackOnly} onChange={setFallbackOnly} /> 只看兜底</label>
        <span>{shown.length} / {log.length} 条</span>
      </Space>
      <Table<LogEntryDto>
        size="small"
        rowKey="seq"
        dataSource={[...shown]}
        pagination={{ pageSize: 50, hideOnSinglePage: true }}
        columns={[
          { title: '溯源', key: 'trace', render: (_, row) => matchId ? <Link preventScrollReset to={`/matches/${encodeURIComponent(matchId)}?tab=trace&seq=${row.seq}`}>调用链</Link> : '—' },
          { title: '#', dataIndex: 'seq', width: 60 },
          { title: '天', dataIndex: 'round', width: 50 },
          { title: '阶段', dataIndex: 'phaseId', width: 150 },
          { title: '频道', dataIndex: 'channel', width: 120, render: (value: string) => <Tag color={channelColor(value)}>{value}</Tag> },
          { title: '内容', key: 'content', render: (_, entry) => describeLog(entry) },
        ]}
      />
    </Space>
  );
}
