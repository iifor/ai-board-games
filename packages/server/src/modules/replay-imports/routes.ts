import { Hono } from 'hono';
import { z } from 'zod';
import { replayDocumentSchema, importGameSchema } from '@battle/shared';
import { badRequest } from '../../utils/errors';
import { ok } from '../../utils/response';
import { parseJson, parseWith } from '../../utils/validate';
import type { AppEnv } from '../../types';
import type { ReplayImportService } from './service';

export function replayRoutes(s: ReplayImportService) {
  const revision = z.number().int().positive(), index = z.number().int().nonnegative();
  const app = new Hono<AppEnv>();
  app.get('/',async c => ok(c,await s.list()));
  app.post('/parse',async c => {
    let form: FormData;
    try { form = await c.req.formData(); } catch { throw badRequest('请使用 multipart 表单上传文件'); }
    const upload = form.get('file');
    if (!upload || typeof upload === 'string' || upload.size > 4*1024*1024) throw badRequest('请选择 4 MiB 以内的文件');
    return ok(c,await s.parse(upload.name,Buffer.from(await upload.arrayBuffer()),parseWith(importGameSchema,form.get('gameKey'))));
  });
  app.post('/preview',async c => {
    const v = await parseJson(c,z.object({ document:replayDocumentSchema, from:index }));
    return ok(c,await s.preview(v.document,v.from));
  });
  app.post('/suggest',async c => {
    const v = await parseJson(c,z.object({ document:replayDocumentSchema, selected:z.array(index).min(1).max(100), modelId:revision }));
    return ok(c,await s.suggest(v.document,v.selected,v.modelId));
  });
  app.post('/',async c => ok(c,await s.save(await parseJson(c,replayDocumentSchema)),201));
  app.get('/:id',async c => ok(c,await s.get(parseWith(z.uuid(),c.req.param('id')))));
  app.put('/:id',async c => {
    const v = await parseJson(c,z.object({ document:replayDocumentSchema, revision }));
    return ok(c,await s.save(v.document,parseWith(z.uuid(),c.req.param('id')),v.revision));
  });
  app.post('/:id/publish',async c => {
    const v = await parseJson(c,z.object({ revision }));
    return ok(c,await s.publish(parseWith(z.uuid(),c.req.param('id')),v.revision));
  });
  return app;
}
