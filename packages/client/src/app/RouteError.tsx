import { useEffect } from 'react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import './RouteError.css';

/** 路由渲染出错或地址不存在时的整页提示：可刷新重试，也可回到大厅，不会白屏 */
export function RouteError() {
  const error = useRouteError();
  const missing = isRouteErrorResponse(error) && error.status === 404;
  useEffect(() => {
    if (!missing) console.error('[route] 页面渲染失败', error);
  }, [error, missing]);
  return (
    <section className="route-error glass-panel" role="alert" aria-labelledby="route-error-title">
      <h1 id="route-error-title">{missing ? '找不到这个页面' : '页面暂时无法显示'}</h1>
      <p>{missing ? '请检查链接地址，或回到大厅重新选择。' : '请刷新重试。如果问题持续，可以先回到大厅。'}</p>
      <div className="route-error-actions">
        {missing ? null : <button type="button" className="button button-primary" onClick={() => window.location.reload()}>刷新重试</button>}
        <Link className={missing ? 'button button-primary' : 'button'} to="/">返回大厅</Link>
      </div>
    </section>
  );
}
