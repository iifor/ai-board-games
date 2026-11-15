import { z } from 'zod';
import { AppError, upstream } from '../../utils/errors';
import type { ProviderCredentials } from '../providers/service';

const pageSchema = z.object({
  data: z.array(z.object({ id: z.string().trim().min(1) })),
  has_more: z.boolean().optional(),
  last_id: z.string().nullish(),
});

/** 使用供应商已保存的 API 根地址，同一请求的各分页共享超时。 */
export async function fetchProviderModelIds(provider: ProviderCredentials): Promise<string[]> {
  const url = new URL(provider.baseUrl);
  url.pathname = url.pathname.replace(/\/+$/, '') + '/models';
  const signal = AbortSignal.timeout(15_000);
  const ids = new Set<string>();
  const cursors = new Set<string>();
  try {
    for (;;) {
      const response = await fetch(url, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${provider.apiKey}` },
        signal, redirect: 'error',
      });
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 401 || response.status === 403) throw upstream('供应商拒绝访问模型目录，请检查 API Key 及其权限');
        if (response.status === 404 || response.status === 405) throw upstream('供应商未提供此模型目录，请检查 Base URL 或手动添加模型');
        throw upstream(`拉取模型目录失败（供应商 HTTP ${response.status}）`);
      }
      const page = pageSchema.safeParse(await response.json());
      if (!page.success) throw upstream('供应商返回的模型列表格式不受支持，可手动添加模型');
      for (const item of page.data.data) ids.add(item.id);
      if (!page.data.has_more) return [...ids].sort();
      const cursor = page.data.last_id || page.data.data.at(-1)?.id;
      if (!cursor || cursors.has(cursor)) throw upstream('供应商模型目录分页异常，请重试或手动添加模型');
      cursors.add(cursor);
      url.searchParams.set('after', cursor);
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw upstream(signal.aborted ? '拉取模型目录超时，请重试' : '无法读取供应商模型目录，请检查 Base URL 或手动添加模型');
  }
}
