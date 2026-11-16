import type { AccessProfile, AccessSessionResponse } from '@battle/shared';
import { http } from './http';

export const createAccessSession = (code: string) => http.post<AccessSessionResponse>('/api/toc/access/session', { code });
export const fetchAccessProfile = (token: string) => http.get<AccessProfile>('/api/toc/access/me', token);
