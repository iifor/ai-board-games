import type { AdminLoginResponse, AdminProfile, ChangePasswordRequest } from '@battle/shared';
import { http } from './http';

export const login = (username: string, password: string) => http.post<AdminLoginResponse>('/api/admin/auth/login', { username, password });
/** 改密后服务端吊销其他令牌，并为当前会话签发新令牌 */
export const changePassword = (request: ChangePasswordRequest) => http.post<AdminLoginResponse>('/api/admin/auth/password', request);
/** 服务端吊销该账号已签发的令牌 */
export const logout = () => http.post<null>('/api/admin/auth/logout', undefined);
export const fetchProfile = () => http.get<AdminProfile>('/api/admin/auth/me');
