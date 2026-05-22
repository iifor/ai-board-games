const { z } = require('zod');
const setDefaultHostSchema = z.object({ defaultHostPlayerId: z.number().nullable().optional() });
module.exports = { setDefaultHostSchema };
