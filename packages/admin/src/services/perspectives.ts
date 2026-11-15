import type { PerspectivePrompt, PerspectiveRecord, PrivateActionTemplate } from '@battle/shared';
import { http } from './http';

const root = '/api/admin/perspectives';
const recordPath = (id: string) => root + '/matches/' + encodeURIComponent(id);
export const perspectives = {
  actions: () => http.get<PrivateActionTemplate[]>(root + '/actions'),
  record: (id: string) => http.get<PerspectiveRecord>(recordPath(id)),
  prompt: (id: string, request: string) => http.get<PerspectivePrompt>(recordPath(id) + '/requests/' + encodeURIComponent(request)),
};
