import { createBrowserRouter, Navigate } from 'react-router';
import { ChangePasswordPage, LoginPage, RequireAuth } from '../features/auth';
import { MatchDetailPage, MatchListPage } from '../features/matches';
import { ModelsPage, PlayersPage, ProvidersPage, VoicesPage } from '../features/resources';
import { AdminLayout } from './AdminLayout';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/password', element: <ChangePasswordPage /> },
  {
    path: '/',
    element: <RequireAuth><AdminLayout /></RequireAuth>,
    children: [
      { index: true, element: <Navigate to="/matches" replace /> },
      { path: 'matches', element: <MatchListPage /> },
      { path: 'matches/:matchId', element: <MatchDetailPage /> },
      { path: 'players', element: <PlayersPage /> },
      { path: 'models', element: <ModelsPage /> },
      { path: 'providers', element: <ProvidersPage /> },
      { path: 'voices', element: <VoicesPage /> },
    ],
  },
]);
