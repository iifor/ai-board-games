import type { PlayerMemoryRecord } from '@battle/shared';
import { Collapse, Tag } from 'antd';
import { Link } from 'react-router';
import type { ReactNode } from 'react';
import { formatTime } from '../../utils/format';

const outcomes = { supported: '复盘认为得到支持', contradicted: '复盘认为遇到反证', unresolved: '尚未验证' };
export function MemoryRecord({ item, action }: { item: PlayerMemoryRecord; action: ReactNode }) {
  const source = '/matches/' + encodeURIComponent(item.matchId) + '?tab=trace&seq=';
  const origin = '/matches/' + encodeURIComponent(item.matchId) + '?tab=trace&request=';
  return <article className="memory-record">
    <header><small>M{item.id} · {item.gameKey} · {formatTime(item.createdAt)}{item.previousId && ' · 修订自 M' + item.previousId}</small>{action}</header>
    <h3>{item.subjectName ? '关于' + item.subjectName : '自己的对局经验'}</h3>
    <p>{item.content}</p>
    {item.decision && <p><Tag>{outcomes[item.outcome]}</Tag>
      <Link to={origin + encodeURIComponent(item.decision.requestId)}>查看当时的决策</Link><br />当时的行动：{item.decision.choice}
      {item.decision.judgement && <><br />当时的判断：{item.decision.judgement}</>}
      {item.decision.evidence.length > 0 && <><br />当时引用的事件：{item.decision.evidence.map(e =>
        <Link key={e.seq} to={source + e.seq}> #{e.seq} </Link>)}</>}</p>}
    <Collapse size="small" items={[
      { key: 'sources', label: '来源证据（' + item.evidence.length + '）', children: item.evidence.map(e =>
        <p key={e.seq}><Link to={source + e.seq}>原局 · 第 {e.round} 轮 · #{e.seq}</Link> · {e.channel === 'public' ? '公开' : e.channel}
          <br />{e.text}</p>) },
      { key: 'uses', label: '后续决策 · 写入提示词 ' + item.uses.length + ' 次，明确引用 ' + item.uses.filter(d => d.explicitlyCited).length + ' 次',
        children: item.uses.length ? item.uses.map(d => <p key={d.matchId + '/' + d.requestId}>
          <Tag>{d.explicitlyCited ? '明确引用' : d.accepted ? '仅提供' : ['running','queued'].includes(d.status) ? '等待决策' : '未采纳'}</Tag>
          <Link to={'/matches/' + encodeURIComponent(d.matchId) + '?tab=trace&request=' + encodeURIComponent(d.requestId)}>
            第 {d.round} 轮 · {d.phaseId} · {d.requestId}</Link><br />{d.choice}
          {d.judgement && <><br />当时的判断：{d.judgement}</>}
        </p>) : '尚未进入后续决策提示词。' },
    ]} />
  </article>;
}
