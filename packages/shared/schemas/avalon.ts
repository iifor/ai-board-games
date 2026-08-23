import { z } from 'zod';

const avalonProposalSchema = z.object({
  teamIds: z.array(z.number().int().positive()).min(2).max(3),
  reason: z.string().trim().max(120).optional().default(''),
});

const avalonTeamVoteSchema = z.object({
  approve: z.boolean(),
  reason: z.string().trim().max(80).optional().default(''),
});

const avalonQuestVoteSchema = z.object({
  success: z.boolean(),
});

const avalonAssassinationSchema = z.object({
  targetId: z.number().int().positive(),
  reason: z.string().trim().max(120).optional().default(''),
});

export {
  avalonAssassinationSchema,
  avalonProposalSchema,
  avalonQuestVoteSchema,
  avalonTeamVoteSchema,
};
