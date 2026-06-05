import { z } from 'zod';

const clearPlayerMemoriesSchema = z.object({
  gameType: z.enum(['werewolf', 'debate', 'all']),
});

const listPlayerMemoriesSchema = z.object({
  gameType: z.enum(['werewolf', 'debate']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export { clearPlayerMemoriesSchema, listPlayerMemoriesSchema };
