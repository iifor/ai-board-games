import type { AdminLoginResponse, AdminProfile, ChangePasswordRequest } from '@battle/shared';
import { http } from './http';

export const login = (username: string, password: string) => http.post<AdminLoginResponse>('/api/admin/auth/login', { username, password });
export const changePassword = (request: ChangePasswordRequest) => http.post<null>('/api/admin/auth/password', request);
export const fetchProfile = () => http.get<AdminProfile>('/api/admin/auth/me');
