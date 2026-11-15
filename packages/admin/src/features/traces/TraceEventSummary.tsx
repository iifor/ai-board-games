import type { StageEvent, TraceNodeDetailDto, TraceNodeDto } from '@battle/shared';
import { describeLog } from '../matches/utils';
import { formatTime } from '../../utils/format';
import { phaseLabel } from './labels';

function textField(data: unknown, key: string): string | null {
  if (!data || typeof data !== 'object') return null;
  const value = (data as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function TraceSnapshot({ event }: { event: StageEvent }) {
  const { extra, seats } = event.view;
  const board = textField(extra, 'board');
  const period = textField(extra, 'period');
  return <section className="trace-snapshot">
    <h4>舞台快照</h4>
    <dl className="trace-facts">
      {board && <><dt>板子</dt><dd>{board}</dd></>}
      {(period === 'night' || period === 'day') && <><dt>昼夜</dt><dd>{period === 'night' ? '夜晚' : '白天'}</dd></>}
      {seats.length > 0 && <><dt>存活座位</dt><dd>{seats.filter(s => s.alive).length} / {seats.length}</dd></>}
    </dl>
    {seats.length > 0 && <details><summary>座位状态（{seats.length}）</summary>
      <table><thead><tr><th>座号</th><th>玩家</th><th>身份</th><th>状态</th></tr></thead>
        <tbody>{seats.map(s => <tr key={s.seat}><td>{s.seat}</td><td>{s.name}</td><td>{s.roleName ?? '—'}</td><td>{s.alive ? '存活' : '出局'}</td></tr>)}</tbody>
      </table>
    </details>}
  </section>;
}

export function TraceEventSummary({ node, detail }: { node: TraceNodeDto; detail: TraceNodeDetailDto }) {
  const { event, data } = detail;
  const body = event?.kind === 'phase_started' ? event.announcement : event ? describeLog(event) : null;
  const reason = textField(data, 'reason') ?? textField(data, 'error');
  const next = node.kind === 'settlement' && textField(data, 'configuredNext');
  return <>
    {body && <p className="trace-event-text">{body}</p>}
    {reason && <p className="trace-error-text">{reason}</p>}
    <dl className="trace-facts">
      {node.seat !== null && <><dt>行动座位</dt><dd>{node.seat} 号</dd></>}
      {next && <><dt>规则跳转目标</dt><dd>{phaseLabel(next)}</dd></>}
      {node.phaseId && <><dt>阶段 ID</dt><dd><code>{node.phaseId}</code></dd></>}
      {node.createdAt && <><dt>记录时间</dt><dd>{formatTime(node.createdAt)}</dd></>}
    </dl>
  </>;
}

