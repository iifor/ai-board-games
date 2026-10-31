import { NavLink, Outlet } from 'react-router';
import './AppLayout.css';

export function AppLayout() {
  return (
    <div className="app-layout">
      <header className="app-nav">
        <strong>AI 对战</strong>
        <NavLink to="/" end>大厅</NavLink>
        <NavLink to="/history">历史对局</NavLink>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
