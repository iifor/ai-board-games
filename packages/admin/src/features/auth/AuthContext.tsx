import { API_ERROR_CODES, type AdminLoginResponse, type AdminProfile } from '@battle/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchProfile, login as loginRequest, logout as logoutRequest } from '../../services/auth';
import { ApiError, AUTH_EVENTS } from '../../services/http';
import { tokenStore } from '../../services/tokenStore';

interface AuthState {
  readonly profile: AdminProfile | null;
  readonly loading: boolean;
  login(username: string, password: string): Promise<void>;
  /** 改密成功后换上服务端签发的新令牌（旧令牌已被吊销） */
  replaceToken(result: AdminLoginResponse): Promise<void>;
  /** 先让服务端吊销令牌，无论结果如何本机都会退出；吊销失败时抛出，供调用方提示 */
  logout(): Promise<void>;
  refresh(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** 管理员登录状态：令牌在 tokenStore，账号信息（含是否需要改密）以服务端为准 */
export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) {
      setProfile(null);
      setLoading(false);
      return;
    }
    try {
      setProfile(await fetchProfile());
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const expired = () => setProfile(null);
    const passwordRequired = () => setProfile((current) => (current ? { ...current, mustChangePassword: true } : current));
    window.addEventListener(AUTH_EVENTS.expired, expired);
    window.addEventListener(AUTH_EVENTS.passwordRequired, passwordRequired);
    return () => {
      window.removeEventListener(AUTH_EVENTS.expired, expired);
      window.removeEventListener(AUTH_EVENTS.passwordRequired, passwordRequired);
    };
  }, [refresh]);

  const value = useMemo<AuthState>(() => ({
    profile,
    loading,
    async login(username, password) {
      const result = await loginRequest(username, password);
      tokenStore.set(result.token);
      await refresh();
    },
    async replaceToken(result) {
      tokenStore.set(result.token);
      await refresh();
    },
    async logout() {
      try {
        await logoutRequest();
      } catch (error) {
        // 401 说明令牌本来就已失效，等同于吊销成功
        if (!(error instanceof ApiError && error.code === API_ERROR_CODES.unauthorized)) throw error;
      } finally {
        tokenStore.clear();
        setProfile(null);
      }
    },
    refresh,
  }), [profile, loading, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth 必须在 AuthProvider 内使用');
  return value;
}
