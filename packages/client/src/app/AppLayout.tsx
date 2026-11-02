import { NavLink, Outlet, useLocation } from 'react-router';
import './AppLayout.css';

/** 外层布局：导航 + 内容区；对局舞台全屏铺满，不显示导航 */
export function AppLayout() {
  const { pathname } = useLocation();
  if (pathname.startsWith('/matches/')) return <Outlet />;
  return (
    <div className="app-layout">
      <header className="app-nav">
        <strong className="app-brand"><i aria-hidden="true" />AI 对战</strong>
        <nav>
          <NavLink to="/" end>大厅</NavLink>
          <NavLink to="/history">历史对局</NavLink>
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
