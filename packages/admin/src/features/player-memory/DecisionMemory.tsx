import type { TraceRequestDto } from '@battle/shared';
import { Tag } from 'antd';

export function DecisionMemory({ memory }: { memory: NonNullable<TraceRequestDto['memory']> }) {
  const { offered, decision } = memory;
  return <section aria-label="本次决策的跨局记忆">
    <h4>本次决策的跨局记忆</h4>
    {offered.length ? offered.map(m => <p key={m.id}>
      <Tag>{decision?.cited.includes(m.id) ? '明确引用' : decision ? '已提供 · 未引用' : '提示词已包含'}</Tag>
      M{m.id} · {m.content}
    </p>) : <p>此次提示词没有往局记忆。</p>}
    {!decision && <p>尚无采纳的模型决策。</p>}
    {decision?.judgement && <p>当时的判断：{decision.judgement}</p>}
  </section>;
}
