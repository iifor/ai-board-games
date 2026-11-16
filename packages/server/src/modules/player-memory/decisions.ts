import type { AdvanceResult, EngineInput } from '@battle/engine';
import type { MemoryDecision } from '@battle/shared';
import { z } from 'zod';
import type { LockedMatchRow } from '../matches/types';

const ids = z.array(z.number().int().positive()).max(12).catch([]);
const noteSchema = z.object({ judgement: z.string().trim().max(300).catch(''), evidence: ids, cited: ids });
const outputSchema = z.object({
  reason: z.string().optional(), speech: z.string().optional(), comment: z.string().optional(),
  verdict: z.string().optional(), target: z.union([z.string(), z.number(), z.null()]).optional(),
  targets: z.array(z.union([z.string(), z.number()])).optional(),
});

export function acceptedDecision(row: LockedMatchRow, input: EngineInput, result: AdvanceResult) {
  if (input.kind !== 'ai_result' || result.acceptedRequestId !== input.requestId) return null;
  const pending = row.snapshot.pending.find(p => p.id === input.requestId);
  const context = pending?.memoryContext;
  const player = row.snapshot.seats.find(s => s.seat === pending?.seat);
  if (!context || !pending || !player) return null;
  const parsed = outputSchema.safeParse(result.acceptedOutput);
  if (!parsed.success) return null;
  const output = parsed.data;
  const info = noteSchema.safeParse(input.output && typeof input.output === 'object' && 'memoryNote' in input.output ? input.output.memoryNote : undefined);
  const note = info.success ? info.data : { judgement: '', evidence: [], cited: [] };
  const choices = {
    speak: output.speech ?? '', judge: (output.verdict ?? '') + ' · ' + (output.comment ?? ''),
    act: '选择 ' + (output.targets?.join('、') || '放弃'), vote: '投票 ' + (output.target ?? '弃票'),
  };
  const offered = context.offered.map(m => m.id);
  const decision: MemoryDecision = {
    matchId: row.id, requestId: pending.id, round: row.snapshot.round, throughSeq: context.throughSeq,
    phaseId: pending.phaseId, action: pending.action,
    // 判断理由是模型的私下输出（memoryNote / reason），不属于游戏日志：本局调用链已删除时不再保存
    choice: choices[pending.action].slice(0, 1200), judgement: row.traceDeleted ? '' : note.judgement || output.reason?.slice(0, 300) || '',
    evidence: context.evidence.filter(e => note.evidence.includes(e.seq)).slice(0, 4), offered,
    cited: offered.filter(id => note.cited.includes(id)),
  };
  return { ownerId: Number(player.profile.playerId), decision };
}
