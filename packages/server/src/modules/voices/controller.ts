import type { Context } from 'hono';
import type { AppEnv } from '../../types';
import { crudController } from '../../utils/crud';
import { parseId } from '../../utils/ids';
import { ok } from '../../utils/response';
import { parseJson } from '../../utils/validate';
import type { VoiceService } from './service';
import { voicePreviewSchema, voiceSchema } from './validator';

export function voiceController(service: VoiceService) {
  return {
    ...crudController(service, { create: voiceSchema, update: voiceSchema }),
    preview: async (c: Context<AppEnv>) => {
      const { text } = await parseJson(c, voicePreviewSchema);
      return ok(c, await service.preview(parseId(c.req.param('id')), text));
    },
    importDefaults: async (c: Context<AppEnv>) => ok(c, await service.importDefaults()),
  };
}
