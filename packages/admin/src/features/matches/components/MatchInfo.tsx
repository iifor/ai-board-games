import { formatMatchTitle, type MatchDetailDto } from '@battle/shared';
import { Descriptions, Tag } from 'antd';
import { publicMatchUrl } from '../../../utils/publicApp';
import type { MatchDetailState } from '../hooks/useMatchDetail';
import { matchTypeLabel, STATUS_LABELS } from '../utils';
import { PhaseGraph } from './PhaseGraph';

type Props = Pick<MatchDetailState, 'log' | 'calls'> & { detail: MatchDetailDto };

export function MatchInfo({ detail, log, calls }: Props) {
  const fallbacks = log.filter((entry) => entry.kind === 'fallback').length;
  const watchUrl = publicMatchUrl(detail.id);

  return (
      <Descriptions className="match-info" size="small" bordered column={{ xs: 1, md: 3 }}>
        <Descriptions.Item label="对局名称">{formatMatchTitle(detail)}</Descriptions.Item>
        <Descriptions.Item label="对局 ID" span={{ xs: 1, md: 2 }}><code>{detail.id}</code></Descriptions.Item>
        <Descriptions.Item label="状态"><Tag color={STATUS_LABELS[detail.status].color}>{STATUS_LABELS[detail.status].label}</Tag></Descriptions.Item>
        <Descriptions.Item label="当前阶段">{detail.phaseId ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="类型">{matchTypeLabel(detail)} · {detail.pacing === 'ack' ? '按确认推进' : '连续生成'}</Descriptions.Item>
        <Descriptions.Item label="事件进度">已推送 {detail.lastSeq} / 观众确认 {detail.ackedSeq}</Descriptions.Item>
        <Descriptions.Item label="模型调用">{calls.length} 次（失败 {calls.filter((call) => call.error).length}）</Descriptions.Item>
        <Descriptions.Item label="兜底">{fallbacks} 次</Descriptions.Item>
        <Descriptions.Item label="结果" span={3}>{detail.result ? `${detail.result.winnerLabel} · ${detail.result.summary}` : '—'}</Descriptions.Item>
        <Descriptions.Item label="座位" span={3}>{detail.seats.map((seat) => `${seat.seat}号 ${seat.name}`).join('，')}</Descriptions.Item>
        <Descriptions.Item label="C 端观看" span={{ xs: 1, md: 2 }}><a href={watchUrl} target="_blank" rel="noreferrer">{watchUrl}</a></Descriptions.Item>
        <Descriptions.Item label="规则全图"><PhaseGraph detail={detail} /></Descriptions.Item>
      </Descriptions>
  );
}
