import { Spin } from 'antd';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from './AuthContext';

/** 未登录跳转登录页；未改初始密码跳转改密页 */
export function RequireAuth({ children }: { readonly children: ReactNode }) {
  const { profile, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spin fullscreen />;
  if (!profile) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (profile.mustChangePassword) return <Navigate to="/password" replace />;
  return <>{children}</>;
}
