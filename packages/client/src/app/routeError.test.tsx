import { renderToStaticMarkup } from 'react-dom/server';
import { createStaticHandler, createStaticRouter, StaticRouterProvider, type RouteObject } from 'react-router';
import { describe, expect, it } from 'vitest';
import { RouteError } from './RouteError';
import { routes } from './routes';

async function render(routeTable: RouteObject[], path: string): Promise<string> {
  const handler = createStaticHandler(routeTable);
  const context = await handler.query(new Request(`http://localhost${path}`));
  if (context instanceof Response) throw new Error(`unexpected redirect for ${path}`);
  const router = createStaticRouter(handler.dataRoutes, context);
  return renderToStaticMarkup(<StaticRouterProvider router={router} context={context} hydrate={false} />);
}

describe('route error page', () => {
  it('shows a not-found page with a way back to the lobby for unknown addresses', async () => {
    const html = await render(routes, '/no-such-page');
    expect(html).toContain('找不到这个页面');
    expect(html).toContain('href="/"');
    expect(html).toContain('返回大厅');
    expect(html).not.toContain('刷新重试');
  });

  it('shows a retry and a lobby link when a route fails, instead of a blank page', async () => {
    const failing: RouteObject[] = [{
      path: '/',
      ErrorBoundary: RouteError,
      children: [{ index: true, loader: () => { throw new Error('boom'); }, element: <p>never</p> }],
    }];
    const html = await render(failing, '/');
    expect(html).toContain('页面暂时无法显示');
    expect(html).toContain('刷新重试');
    expect(html).toContain('返回大厅');
    expect(html).not.toContain('never');
  });
});
