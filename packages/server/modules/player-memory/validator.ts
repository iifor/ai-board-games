import { z } from 'zod';

const clearPlayerMemoriesSchema = z.object({
  gameType: z.enum(['werewolf', 'debate', 'all']),
});

export { clearPlayerMemoriesSchema };
