import type { RouteObject } from 'react-router';
import { StagePage } from '../features/game-stage';
import { HistoryPage } from '../features/history';
import { LobbyPage, SetupPage } from '../features/lobby';
import { ImportPreview } from '../features/game-stage/pages/ImportPreview';
import { AppLayout } from './AppLayout';
import { RouteError } from './RouteError';

/** 路由表（与浏览器路由分开，便于测试）。外层错误页兜住布局自身与不存在的地址；内层的让大厅 / 历史出错时导航仍在 */
export const routes: RouteObject[] = [{
  ErrorBoundary: RouteError,
  children: [
    { path: '/import-preview', element: <ImportPreview /> },
    {
      path: '/',
      element: <AppLayout />,
      children: [{
        ErrorBoundary: RouteError,
        children: [
          { index: true, element: <LobbyPage /> },
          { path: 'play/:gameKey', element: <SetupPage /> },
          { path: 'matches/:matchId', element: <StagePage /> },
          { path: 'history', element: <HistoryPage /> },
        ],
      }],
    },
  ],
}];
