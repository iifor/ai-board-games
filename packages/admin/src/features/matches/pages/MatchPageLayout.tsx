import type { MatchDetailDto } from '@battle/shared';
import { Alert, Spin } from 'antd';
import { Link, Navigate, Outlet, useLocation, useOutletContext, useParams } from 'react-router';
import { useMatchDetail } from '../hooks/useMatchDetail';
import './MatchDetailPage.css';

type MatchPageContext = ReturnType<typeof useMatchDetail> & { detail: MatchDetailDto };
export const useMatchPage = () => useOutletContext<MatchPageContext>();

export function MatchTabRedirect({ tab }: { tab: 'debug' | 'trace' }) {
  const { matchId = '' } = useParams();
  const params = new URLSearchParams(useLocation().search);
  params.set('tab', tab);
  return <Navigate replace to={{ pathname: `/matches/${encodeURIComponent(matchId)}`, search: params.toString() }} />;
}

function Layout({ matchId }: { matchId: string }) {
  const state = useMatchDetail(matchId);
  const { detail, error } = state;
  return <section className="match-detail">
    <Link to="/matches">← 返回对局列表</Link>
    {error && <Alert type={detail ? 'warning' : 'error'} title={error} />}
    {detail ? <>
      {detail.error && <Alert type="error" title={detail.error} />}
      <Outlet context={{ ...state, detail } satisfies MatchPageContext} />
    </> : !error && <Spin />}
  </section>;
}

export function MatchPageLayout() {
  const { matchId = '' } = useParams();
  return <Layout key={matchId} matchId={matchId} />;
}
