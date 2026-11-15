import { createBrowserRouter } from 'react-router';
import { StagePage } from '../features/game-stage';
import { HistoryPage } from '../features/history';
import { LobbyPage, SetupPage } from '../features/lobby';
import { ImportPreview } from '../features/game-stage/pages/ImportPreview';
import { AppLayout } from './AppLayout';

export const router = createBrowserRouter([
  { path:'/import-preview', element:<ImportPreview/> },
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <LobbyPage /> },
      { path: 'play/:gameKey', element: <SetupPage /> },
      { path: 'matches/:matchId', element: <StagePage /> },
      { path: 'history', element: <HistoryPage /> },
    ],
  },
]);
