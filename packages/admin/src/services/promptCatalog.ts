import type { CatalogComparison, CatalogPreview, PromptCatalogDetail, PromptCatalogItem, PromptExampleRef } from '@battle/shared';
import { http } from './http';

const base = '/api/admin/prompts';
const path = (group: string, key: string) => `${base}/${encodeURIComponent(group)}/${encodeURIComponent(key)}`;
export const promptCatalog = {
  list: () => http.get<PromptCatalogItem[]>(base),
  detail: (group: string, key: string) => http.get<PromptCatalogDetail>(path(group, key)),
  save: (group: string, key: string, source: string, revision: number) =>
    http.put<{ revision: number }>(path(group, key), { source, revision }),
  preview: (group: string, key: string, example: PromptExampleRef, source?: string) =>
    http.post<CatalogPreview>(path(group, key) + '/preview', { example, source }),
  compare: (group: string, key: string, example: PromptExampleRef, source: string, modelId: number) =>
    http.post<CatalogComparison>(path(group, key) + '/compare', { example, source, modelId }),
};
