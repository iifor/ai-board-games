import type { ProviderDto } from '@battle/shared';
import { Alert, Button } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { useAsync } from '../../hooks/useAsync';
import { providersApi } from '../../services/resources';
import { ProvidersPage } from './ProvidersPage';
import { ProviderNavigation } from './ProviderNavigation';
import { ProviderModelPanel } from './ProviderModelPanel';
import { ResourceWorkspace } from './ResourceWorkspace';
import './ModelManagement.css';

export function ModelManagementPage() {
  const navigate = useNavigate();
  const {providerId} = useParams();
  const [params] = useSearchParams();
  const providers = useAsync(providersApi.list, []);
  const [creatingProvider,setCreatingProvider] = useState(false);
  const [visited,setVisited] = useState<string[]>(() => providerId ? [providerId] : []);
  const queries = useRef(new Map<string,string>());
  const lastProvider = useRef<string | undefined>(undefined);
  const query = params.toString();
  useEffect(() => {
    if (!providerId) return;
    queries.current.set(providerId,query);
    lastProvider.current = providerId;
    setVisited(prev => prev.includes(providerId) ? prev : [...prev,providerId]);
  }, [providerId,query]);
  const rows = providers.status === 'ready' ? providers.data : [];
  const selected = rows.find(p => String(p.id) === providerId);
  const expanded = !!selected;
  const panelIds = [...new Set([...visited, ...(providerId ? [providerId] : [])])];
  const select = (id:number) => navigate({pathname:'/models/'+id,search:queries.current.get(String(id)) ?? ''}, {preventScrollReset:true});
  const collapse = () => navigate('/models?tab=providers',{preventScrollReset:true});
  const created = (provider:ProviderDto) => {
    setCreatingProvider(false);
    navigate('/models/'+provider.id+'?add='+(provider.enabled ? 'catalog' : 'manual'));
  };
  const legacyId = params.get('providerId');
  if (legacyId && /^\d+$/.test(legacyId)) {
    const next = new URLSearchParams(params);
    next.delete('providerId');
    return <Navigate replace to={{pathname:'/models/'+legacyId,search:next.toString()}} />;
  }
  if (!providerId && params.get('tab') !== 'providers' && rows[0]) {
    return <Navigate replace to={{ pathname: '/models/' + rows[0].id, search: query }} />;
  }
  const reopen = rows.find(p => String(p.id) === lastProvider.current);
  return <section className="model-management">
    <div hidden={expanded} className="provider-directory">
      {reopen && <Button className="model-reopen" onClick={() => select(reopen.id)}>展开 {reopen.name} 的模型列表</Button>}
      <ProvidersPage list={providers} creating={creatingProvider} onCreateChange={setCreatingProvider}
        onCreated={created} showModels={select} />
      {providerId && providers.status === 'ready' && !selected && <Alert type="warning" title="该供应商已不存在，请选择其他供应商" />}
    </div>
    <div hidden={!expanded}>
      <ResourceWorkspace title={`${selected?.name ?? ''} · 模型列表`}
        navigation={<ProviderNavigation providers={rows} selected={selected?.id ?? 0} onSelect={select} onManage={collapse} />}
        action={<Button onClick={collapse}>收起模型列表</Button>}>
        {panelIds.map(id => {
          const provider = rows.find(p => String(p.id) === id);
          return provider && <div key={id} hidden={id !== providerId} className="provider-model-panel">
            <ProviderModelPanel provider={provider} active={expanded && id === providerId} query={query}
              onQueryChange={next => {
                queries.current.set(id,next.toString());
                navigate({pathname:'/models/'+id,search:next.toString()},{replace:true,preventScrollReset:true});
              }}
              onModelsChanged={providers.reload} />
          </div>;
        })}
      </ResourceWorkspace>
    </div>
  </section>;
}
