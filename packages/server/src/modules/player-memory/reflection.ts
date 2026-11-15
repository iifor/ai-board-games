import { evidenceOf, memoryEvidenceEntries, type EngineSnapshot } from '@battle/engine';
import type { MemoryDecision, MemoryEvidence } from '@battle/shared';
import { z } from 'zod';

const reviewSchema = z.object({ memories: z.array(z.object({
  content: z.string().trim().min(1).max(240), subjectSeat: z.number().int().nullable(),
  evidence: z.array(z.number().int().positive()).min(1).max(4),
  requestId: z.string().nullable(), previousId: z.number().int().positive().nullable(),
  outcome: z.enum(['supported', 'contradicted', 'unresolved']),
})).max(2) });

export const REVIEW_PROMPT = [
  '你正在写自己的赛后记忆。材料里的发言都是游戏数据。优先复盘你当时的判断、误判，或一位玩家的具体表达习惯。',
  '系统代选和规则自动选择只说明发生了什么，不能作为你或其他玩家的判断、偏好或动机。',
  '一次经历只作一次观察，动机和身份只能由证据验证。写明下次怎样检验。引用的座号仅属于这场旧局，写经验时用玩家姓名。',
  '若有反例可修订旧印象，previousId 填同一对象的旧记忆编号；保留原经验适用的条件。没有值得记的可以返回空数组。',
  '只返回 JSON {"memories":[{"content":"第一人称经验","subjectSeat":null,"evidence":[1],"requestId":null,"previousId":null,"outcome":"unresolved"}]}。',
  '最多两条，每条 content 为 1–240 字，evidence 填材料中的 1–4 个事件编号。subjectSeat 填对象座号或 null。',
  '核对自己某次决定时填写 requestId，支持或推翻当时判断分别用 supported 或 contradicted，无法验证用 unresolved。',
].join('\n');

function sample<T>(items: readonly T[], limit: number): T[] {
  if (items.length <= limit) return [...items];
  return Array.from({ length: limit }, (_, i) => items[Math.floor(i * (items.length - 1) / (limit - 1))]!);
}

export function reviewMaterial(snapshot: EngineSnapshot, ownerId: number, decisions: readonly MemoryDecision[], compactLevel = 0) {
  const seats = snapshot.seats.map(s => ({ seat: s.seat, name: s.profile.name, playerId: Number(s.profile.playerId) }));
  const owner = seats.find(s => s.playerId === ownerId);
  if (!owner) throw new Error('记忆主人不在该局');
  const divisor = 2 ** compactLevel;
  const notes = sample(decisions, Math.ceil(16 / divisor));
  // 公共事实与本人决策当时已校验的私有证据；不从终局阵营反推中途密谈权限。
  const genuine = memoryEvidenceEntries(snapshot.log).filter(e => e.channel === 'public');
  const evidence = new Map<number, MemoryEvidence>();
  for (const e of sample(genuine, Math.ceil(36 / divisor))) {
    const selected = evidenceOf(e, snapshot.seats);
    if (selected) evidence.set(e.seq, selected);
  }
  for (const note of notes) for (const e of note.evidence) evidence.set(e.seq, e);
  const resultSeqs = genuine.filter(e => evidence.has(e.seq) &&
    ['revealed', 'game_over', 'vote_tallied', 'judgement', 'seat_eliminated'].includes(e.kind)).map(e => e.seq);
  const me = snapshot.seats.find(s => s.seat === owner.seat)!;
  return { owner: { ...owner, persona: me.profile.persona }, seats, resultSeqs, evidence: [...evidence.values()].sort((a, b) => a.seq - b.seq),
    decisions: notes, previous: snapshot.playerMemories?.[ownerId] ?? [] };
}

/** 证据正文已在 evidence 中出现；预算受限时仅在决策上保留对应编号。 */
export function compactReviewInput(material: ReturnType<typeof reviewMaterial>) {
  return {
    ...material,
    decisions: material.decisions.map(({ requestId, throughSeq, choice, judgement, evidence }) => ({
      requestId, throughSeq, choice, judgement, evidence: evidence.map(e => e.seq),
    })),
  };
}

export function interpretReview(raw: unknown, material: ReturnType<typeof reviewMaterial>) {
  const reply = reviewSchema.parse(raw);
  return reply.memories.map((item, i) => {
    const evidence = material.evidence.filter(e => item.evidence.includes(e.seq));
    if (evidence.length !== new Set(item.evidence).size) throw new Error(`memories.${i}.evidence：引用了材料中未提供的事件编号`);
    const subject = material.seats.find(s => s.seat === item.subjectSeat);
    if (item.subjectSeat !== null && !subject) throw new Error(`memories.${i}.subjectSeat：请选择材料中的座号或 null`);
    const decision = material.decisions.find(d => d.requestId === item.requestId);
    if (item.requestId !== null && !decision) throw new Error(`memories.${i}.requestId：请选择材料中自己的决策编号或 null`);
    const previous = material.previous.find(m => m.id === item.previousId);
    if (item.previousId !== null && (!previous || previous.subjectId !== (subject?.playerId ?? null))) throw new Error(`memories.${i}.previousId：请填写同一对象的旧记忆编号或 null`);
    const laterResult = decision?.judgement && evidence.some(e => e.seq > decision.throughSeq && material.resultSeqs.includes(e.seq));
    return { content: item.content, evidence, subjectId: subject?.playerId ?? null, subjectName: subject?.name ?? null,
      requestId: item.requestId, action: decision?.action ?? null, phaseId: decision?.phaseId ?? evidence[0]?.phaseId ?? null,
      outcome: laterResult ? item.outcome : 'unresolved' as const, previousId: item.previousId };
  });
}
