import { Hono } from 'hono';
import type { AppEnv } from '../../types';
import { notFound } from '../../utils/errors';
import type { TtsService } from './service';

/** 合成音频的读取；内容按（音色、文本）哈希寻址，可长期缓存 */
export function mediaRoutes(service: TtsService) {
  return new Hono<AppEnv>().get('/:id', async (c) => {
    const id = c.req.param('id');
    if (!/^[0-9a-f]{40}$/.test(id)) throw notFound('音频');
    const asset = await service.find(id);
    if (!asset) throw notFound('音频');
    return c.body(new Uint8Array(asset.data), 200, {
      'Content-Type': asset.mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
  });
}
