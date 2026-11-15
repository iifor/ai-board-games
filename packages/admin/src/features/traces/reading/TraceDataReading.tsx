import type { MatchTraceDto, TraceNodeDetailDto } from '@battle/shared';
import { describeLog } from '../../matches/utils';
import { traceLabel } from '../labels';
import { dataFacts, fieldValue, object, readSnapshot } from './traceData';
import './TraceDataReading.css';

function Facts({ entries }: { entries: readonly [string, string][] }) {
  return <dl className="trace-read-facts">{entries.map(([key, value]) =>
    <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>;
}

function Snapshot({ snap }: { snap: NonNullable<ReturnType<typeof readSnapshot>> }) {
  const { seats } = snap;
  const alive = seats.filter(s => s.alive === true).length;
  const known = seats.every(s => s.alive !== null);
  return <>
    {snap.boardName && <h4>{snap.boardName}</h4>}
    {snap.topic && <section><h4>辩题 · {snap.topic}</h4>
      <Facts entries={Object.entries({ 正方: snap.pro, 反方: snap.con }).flatMap(([k,v]) => v ? [[k,v]] : [])} /></section>}
    {snap.status.length > 0 && <Facts entries={snap.status} />}
    {seats.length > 0 && <section><div className="trace-read-title"><h4>座位阵容</h4>
      <span>{seats.length} 席{known && ` · ${alive} 存活 · ${seats.length - alive} 出局`}</span></div>
      <div className="trace-read-roster"><table aria-label="座位阵容"><thead><tr>{['座位','玩家','角色','阵营','状态'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{seats.map(s => <tr key={s.seat}><th scope="row">{s.seat} 号</th><td>{s.name}</td><td>{s.role}</td>
          <td>{s.team}</td><td data-alive={s.alive}>{s.alive === null ? '未记录' : s.alive ? '存活' : '出局'}</td></tr>)}</tbody></table></div>
    </section>}
    {snap.hasNight && <section><h4>当晚行动</h4>{snap.night.length ? <Facts entries={snap.night} /> : <p>当前快照尚无夜间行动记录。</p>}</section>}
    {snap.rules && <details><summary>板子规则</summary><p>{snap.rules}</p></details>}
  </>;
}

const requestStatus: Record<string, string> = { succeeded: '成功', failed: '失败', queued: '排队中', pending: '待执行', running: '执行中', cancelled: '已取消' };
export function TraceDataReading({ detail, match }: { detail: TraceNodeDetailDto; match: MatchTraceDto['match'] }) {
  const snap = readSnapshot(detail.data, match);
  const data = object(detail.data);
  const outcome = snap ? dataFacts(Object.fromEntries(['result', 'configuredNext']
    .filter(key => data[key] != null).map(key => [key, data[key]]))) : [];
  const facts = dataFacts(data, snap ? ['state','seats','result','configuredNext'] : []);
  const { event, requests } = detail;
  return <div className="trace-reading">
    {outcome.length > 0 && <section><h4>结算记录</h4><Facts entries={outcome} /></section>}
    {snap && <Snapshot snap={snap} />}
    {event && <section><h4>{traceLabel(event.kind)}</h4>
      <p>{event.kind === 'phase_started' ? event.announcement || event.title : describeLog(event)}</p></section>}
    {requests.map(r => <section key={r.id}><h4>{r.seat} 号 · {traceLabel(r.action)}</h4>
      <Facts entries={[['请求状态', requestStatus[r.status] ?? r.status], ['模型调用', String(r.calls.length)],
        ...(r.legalTargets ? [['合法目标', r.legalTargets.map(n => n + ' 号').join('、') || '无'] as [string,string]] : [])]} />
      {r.prompt.instruction && <details><summary>当前任务</summary><p>{r.prompt.instruction}</p></details>}
      {r.output != null && <details open><summary>任务输出</summary><p>{fieldValue(r.output)}</p></details>}
      {r.calls.map(call => <details key={call.id}><summary>{call.modelName} · {call.error ? '失败' : '成功'}
        {call.latencyMs != null && ` · ${call.latencyMs} ms`}</summary>
        {call.error && <p className="trace-error-text">{call.error}</p>}
        {call.rawResponse != null && <p>{call.rawResponse}</p>}
      </details>)}
      {r.error && <p className="trace-error-text">{r.error}</p>}
    </section>)}
    {facts.length > 0 && (snap ? <details><summary>记录参数</summary><Facts entries={facts} /></details> : <Facts entries={facts} />)}
    {!snap && !facts.length && !event && !requests.length && <p>{detail.data == null ? '此节点没有附加数据。' : fieldValue(detail.data)}</p>}
  </div>;
}
