import type { MemoryCard, MemoryEvidence } from '@battle/shared';
import type { AiAction, EngineSnapshot, JsonSchema, LogEntry, Seat } from '../runtime/types';
import { entryVisibleTo } from '../visibility/channels';
import { formatHistoryEntry } from './history';

/** 游戏日志另外记录兜底状态；同一轮同一阶段同一席的系统代发台词不用于学习表达习惯。 */
export function memoryEvidenceEntries(log: readonly LogEntry[]) {
  // 旧日志缺少精确来源，维持原有保守过滤。新日志只排除被系统代办的具体事件。
  const fallback = new Set(log.flatMap(e => e.kind === 'fallback' && !e.action ? [[e.round, e.phaseId, e.seat].join('/')] : []));
  return log.filter(e => e.kind !== 'fallback' && e.kind !== 'phase_started' &&
    !(e.kind === 'narration' && e.purpose === 'missed_speech') &&
    !((e.kind === 'action' || e.kind === 'judgement' || e.kind === 'speech') && e.source) &&
    !((e.kind === 'speech' || e.kind === 'judgement' || e.kind === 'action') && fallback.has([e.round, e.phaseId, e.seat].join('/'))));
}

export function evidenceOf(entry: LogEntry, seats: readonly Seat[]): MemoryEvidence | null {
  const text = formatHistoryEntry(entry, n => {
    const seat = seats.find(s => s.seat === n);
    return seat ? n + '号 ' + seat.profile.name : n + '号';
  });
  return text ? { seq: entry.seq, round: entry.round, phaseId: entry.phaseId, channel: entry.channel, text: text.slice(0, 600) } : null;
}

/** 每个请求冻结可引用编号；同批其他席位稍后产生的新日志不在范围内。 */
export function recall(s: EngineSnapshot, viewer: Seat, action: AiAction) {
  const bank = s.playerMemories?.[viewer.profile.playerId];
  if (!bank) return undefined;
  const visible = memoryEvidenceEntries(s.log).filter(e => entryVisibleTo(e, viewer));
  const speakers = visible.slice(-6).flatMap(e => e.kind === 'speech' ? [e.seat] : []);
  const score = (card: MemoryCard) => {
    const subject = s.seats.find(p => p.profile.playerId === String(card.subjectId));
    return Number(card.phaseId === s.cursor.phaseId) * 4 + Number(card.action === action) * 2
      + Number(subject && speakers.includes(subject.seat)) * 4;
  };
  const offered = [...bank].sort((a, b) => score(b) - score(a) || b.id - a.id).slice(0, 3);
  const evidence = visible.slice(-12).flatMap(e => evidenceOf(e, s.seats) ?? []);
  return { offered, evidence, throughSeq: s.log.at(-1)?.seq ?? 0 };
}

export function memoryHistory(context: NonNullable<ReturnType<typeof recall>>, seats: readonly Seat[]) {
  const lines = context.offered.map(memory => {
    const subject = seats.find(seat => seat.profile.playerId === String(memory.subjectId));
    const label = subject ? `本局${subject.seat}号 ${subject.profile.name}` : memory.subjectName && `${memory.subjectName}（本局未入座）`;
    return 'M' + memory.id + ' ' + (label ? '关于' + label + '：' : '') + memory.content;
  });
  return [
    ...(lines.length ? ['【我的往局经验】仅作参考，结合本局证据重新判断。', ...lines] : []),
    ...(context.evidence.length ? ['【本次可引用的事件】', ...context.evidence.map(e => '#' + e.seq + ' ' + e.text)] : []),
  ].join('\n');
}

export function memoryOutputSchema(base: JsonSchema, context: NonNullable<ReturnType<typeof recall>>): JsonSchema {
  const properties = typeof base.properties === 'object' && base.properties !== null ? base.properties : {};
  return { ...base, properties: { ...properties, memoryNote: {
    type: 'object', additionalProperties: false,
    description: '私有决策笔记。简述判断及依据，填所依据的本局事件编号；只有实际用到往局经验时才填对应 M 编号的数字部分。无需写入公开台词。',
    properties: {
      judgement: { type: 'string', maxLength: 300 },
      evidence: { type: 'array', maxItems: Math.min(4, context.evidence.length), items: { type: 'integer', ...(context.evidence.length > 0 && { enum: context.evidence.map(e => e.seq) }) } },
      cited: { type: 'array', maxItems: context.offered.length, items: { type: 'integer', ...(context.offered.length > 0 && { enum: context.offered.map(m => m.id) }) } },
    },
  } } };
}
