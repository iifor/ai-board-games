import type { AnnouncementItem, AnnouncementUpdate } from '@battle/shared';
import { http } from './http';

const path = '/api/admin/announcements';
export const announcements = {
  list: () => http.get<AnnouncementItem[]>(path),
  preview: (key: string, text: string) => http.post<{ text: string }>(path + '/' + encodeURIComponent(key) + '/preview', { text }),
  save: (key: string, update: AnnouncementUpdate) => http.put<AnnouncementItem>(path + '/' + encodeURIComponent(key), update),
};
