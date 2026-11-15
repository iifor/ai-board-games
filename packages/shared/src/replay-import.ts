import { z } from 'zod';

const seat = z.number().int().min(1).max(64);
const name = z.string().trim().min(1).max(160);
export const importGameSchema = z.enum(['werewolf', 'debate']);
export const importKinds = ['phase', 'speech', 'narration', 'inspect', 'attack', 'save', 'poison', 'eliminate', 'reveal', 'sheriff', 'judgement', 'pending', 'ignored'] as const;
export const importEventSchema = z.strictObject({
  kind: z.enum(importKinds), text: z.string().max(16000), seat: seat.optional(), target: seat.optional(),
  round: z.number().int().positive().max(999).optional(), phaseId: name.optional(), value: name.optional(),
  visibility: z.enum(['public', 'spectator']).optional(), sources: z.array(z.number().int().nonnegative()).max(1000).optional(),
});
export const importPlayerSchema = z.strictObject({
  seat, name, role: name.optional(), team: name.optional(), position: seat.optional(), playerId: z.number().int().positive().optional(),
});
export const replayScriptSchema = z.strictObject({
  version: z.literal(1), gameKey: importGameSchema, title: name,
  players: z.array(importPlayerSchema).max(64), events: z.array(importEventSchema).max(3000),
  topic: z.strictObject({ title: name, pro: name.optional(), con: name.optional() }).optional(),
  result: z.strictObject({ winner: name.optional(), winnerLabel: name.optional(), summary: z.string().max(2000).optional(), mvp: seat.optional() }).optional(),
});
export const replayDocumentSchema = z.strictObject({
  filename: name, originalJson: z.string().max(4*1024*1024).optional(), sources: z.array(z.string().max(32000)).max(12000), script: replayScriptSchema,
});
export type ReplayGame = z.infer<typeof importGameSchema>;
export type ReplayEntry = z.infer<typeof importEventSchema>;
export type ReplayPlayer = z.infer<typeof importPlayerSchema>;
export type ReplayScript = z.infer<typeof replayScriptSchema>;
export type ReplayDocument = z.infer<typeof replayDocumentSchema>;
export interface ReplayDraftSummary { id: string; title: string; revision: number; matchId: string | null }
export interface ReplayDraft extends ReplayDraftSummary { document: ReplayDocument }
export interface ReplayPreview { events: import('./stage').StageEvent[]; start: number }
