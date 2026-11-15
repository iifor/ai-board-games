import { Tabs } from 'antd';
import { Navigate, useSearchParams } from 'react-router';
import { AnnouncementPage } from '../announcements/AnnouncementPage';
import { PrivateActions } from './PrivateActions';
import './perspectives.css';

export function PerspectivePage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  if (requested === 'match') return <Navigate to="/matches" replace />;
  const tab = requested === 'actions' ? 'actions' : 'calls';
  return <Tabs activeKey={tab} onChange={value => setParams(value === 'calls' ? {} : { tab: value })}
    items={[
      { key: 'calls', label: '叫号与法官播报', children: <AnnouncementPage /> },
      { key: 'actions', label: '私密行动', children: <PrivateActions /> },
    ]} />;
}
