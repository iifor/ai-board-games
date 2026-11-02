import { Alert, Card, Descriptions, Spin, Tabs, Tag, Typography } from 'antd';
import { Link, useParams } from 'react-router';
import { formatMatchTitle } from '../../../utils/format';
import { DebugControls } from '../components/DebugControls';
import { LogPanel } from '../components/LogPanel';
import { PhaseGraph } from '../components/PhaseGraph';
import { TracePanel } from '../components/TracePanel';
import { useMatchDetail } from '../hooks/useMatchDetail';
import { STATUS_LABELS } from '../utils';
import './MatchDetailPage.css';

export function MatchDetailPage() {
  const matchId = useParams().matchId ?? '';
  const { detail, log, calls, error, reload } = useMatchDetail(matchId);
  if (!detail) return error ? <Alert type="error" title={error} /> : <Spin />;
  const fallbacks = log.filter((entry) => entry.kind === 'fallback').length;

  return (
    <section className="match-detail">
      <Link to="/matches">← 返回列表</Link>
      <Typography.Title level={3}>{formatMatchTitle(detail)}</Typography.Title>
      {error ? <Alert type="warning" title={`刷新失败：${error}`} /> : null}
      {detail.error ? <Alert type="error" title={detail.error} /> : null}
      <Descriptions size="small" bordered column={{ xs: 1, md: 3 }}>
        <Descriptions.Item label="状态"><Tag color={STATUS_LABELS[detail.status].color}>{STATUS_LABELS[detail.status].label}</Tag></Descriptions.Item>
        <Descriptions.Item label="当前阶段">{detail.phaseId ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="类型">{detail.debug ? (detail.scripted ? '调试 · 脚本化' : '调试') : '公开'} · {detail.pacing === 'ack' ? '按确认推进' : '连续生成'}</Descriptions.Item>
        <Descriptions.Item label="事件进度">已推送 {detail.lastSeq} / 观众确认 {detail.ackedSeq}</Descriptions.Item>
        <Descriptions.Item label="模型调用">{calls.length} 次（失败 {calls.filter((call) => call.error).length}）</Descriptions.Item>
        <Descriptions.Item label="兜底">{fallbacks} 次</Descriptions.Item>
        <Descriptions.Item label="结果" span={3}>{detail.result ? `${detail.result.winnerLabel} · ${detail.result.summary}` : '—'}</Descriptions.Item>
        <Descriptions.Item label="座位" span={3}>{detail.seats.map((seat) => `${seat.seat}号 ${seat.name}`).join('，')}</Descriptions.Item>
        <Descriptions.Item label="C 端观看" span={3}><code>/matches/{detail.id}</code></Descriptions.Item>
      </Descriptions>
      <Tabs
        items={[
          {
            key: 'debug',
            label: '调试',
            children: (
              <div className="match-detail-debug">
                <Card size="small" title="调试指令"><DebugControls detail={detail} onChanged={() => void reload()} /></Card>
                <Card size="small" title="阶段图"><PhaseGraph gameKey={detail.gameKey} current={detail.phaseId} /></Card>
              </div>
            ),
          },
          { key: 'trace', label: `Trace（${calls.length}）`, children: <TracePanel calls={calls} /> },
          { key: 'log', label: `完整日志（${log.length}）`, children: <LogPanel log={log} /> },
        ]}
      />
    </section>
  );
}
