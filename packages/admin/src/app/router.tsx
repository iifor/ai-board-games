import { createBrowserRouter, Navigate } from 'react-router';
import { ChangePasswordPage, LoginPage, RequireAuth } from '../features/auth';
import { MatchDetailPage, MatchListPage } from '../features/matches';
import { MatchPageLayout, MatchTabRedirect } from '../features/matches/pages/MatchPageLayout';
import { ModelManagementPage, PlayersPage, VoicesPage } from '../features/resources';

import { AccessCodesPage } from '../features/access-codes';
import { AdminLayout } from './AdminLayout';
import { PerspectivePage } from '../features/perspectives/PerspectivePage';
import { PromptCatalogPage } from '../features/prompts/PromptCatalogPage';
import { AdminRouteError } from './AdminRouteError';

export const router = createBrowserRouter([{
  ErrorBoundary: AdminRouteError,
  children: [
    { path: '/login', element: <LoginPage /> },
    { path: '/password', element: <ChangePasswordPage /> },
    {
      path: '/',
      element: <RequireAuth><AdminLayout /></RequireAuth>,
      children: [{
        ErrorBoundary: AdminRouteError,
        children: [
          { index: true, element: <Navigate to="/matches" replace /> },
          { path: 'matches', element: <MatchListPage /> },
          { path: 'prompts', element: <PromptCatalogPage /> },
          { path: 'perspectives', element: <PerspectivePage /> },
          { path: 'announcements', element: <Navigate to="/perspectives" replace /> },
          { path: 'matches/import', element: <Navigate to='/matches?import=1' replace /> },
          { path: 'matches/:matchId', element: <MatchPageLayout />, children: [
            { index: true, element: <MatchDetailPage /> },
          ] },
          { path: 'matches/:matchId/debug', element: <MatchTabRedirect tab="debug" /> },
          { path: 'matches/:matchId/trace', element: <MatchTabRedirect tab="trace" /> },
          { path: 'replay-imports', element: <Navigate to="/matches?import=1" replace /> },
          { path: 'traces', element: <Navigate to="/matches" replace /> },
          { path: 'traces/:matchId', element: <MatchTabRedirect tab="trace" /> },
          { path: 'access-codes', element: <AccessCodesPage /> },
          { path: 'players', element: <PlayersPage /> },
          { path: 'models/:providerId?', element: <ModelManagementPage /> },
          { path: 'providers', element: <Navigate to="/models?tab=providers" replace /> },
          { path: 'voices/:provider?', element: <VoicesPage /> },
          { path: '*', element: <AdminRouteError notFound /> },
        ],
      }],
    },
  ],
}]);
