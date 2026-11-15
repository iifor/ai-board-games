import { Button, Result, Space } from 'antd';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import './AdminRouteError.css';

export function AdminRouteError({ notFound = false }: { readonly notFound?: boolean }) {
  const error = useRouteError();
  const missing = notFound || (isRouteErrorResponse(error) && error.status === 404);
  return (
    <section className="admin-route-error" aria-labelledby="admin-error-title">
      <Result
        status={missing ? 'info' : 'warning'}
        title={<h1 id="admin-error-title">{missing ? '找不到这个页面' : '页面暂时无法显示'}</h1>}
        subTitle={missing ? '请检查链接地址，或返回对局列表。' : '请刷新当前页面重试。如果问题持续，可以先返回对局列表。'}
        extra={<Space wrap>
          {!missing && <Button type="primary" onClick={() => window.location.reload()}>刷新重试</Button>}
          <Button type={missing ? 'primary' : 'default'} href="/matches">返回对局列表</Button>
        </Space>}
      />
    </section>
  );
}
