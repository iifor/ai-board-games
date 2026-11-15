import type { ProviderDto } from '@battle/shared';
import { App } from 'antd';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FilterValues } from '../../components/ListFilterBar';
import { ModelsPage } from './ModelsPage';
import { ProviderModelPicker } from './ProviderModelPicker';

interface Props {
  provider: ProviderDto;
  active: boolean;
  query: string;
  onQueryChange: (query: URLSearchParams) => void;
  onModelsChanged: () => void;
}

export function ProviderModelPanel({provider, active, query, onQueryChange, onModelsChanged}: Props) {
  const [savedQuery, setSavedQuery] = useState(query);
  const [revision, setRevision] = useState(0);
  const scrollPane = useRef<HTMLDivElement>(null);
  const scrollTop = useRef(0);
  const {message} = App.useApp();
  useEffect(() => { if (active) setSavedQuery(query); }, [active, query]);
  useLayoutEffect(() => {
    if (active && scrollPane.current) scrollPane.current.scrollTop = scrollTop.current;
  }, [active]);
  const params = new URLSearchParams(active ? query : savedQuery);
  const dialog = active ? params.get('add') : null;
  const change = (updates: FilterValues) => {
    const next = new URLSearchParams(params);
    for (const [key,value] of Object.entries(updates)) {
      if (value) next.set(key,value);
      else next.delete(key);
    }
    setSavedQuery(next.toString());
    onQueryChange(next);
  };
  return <div className="provider-model-scroll resource-workspace-scroll" ref={scrollPane}
    onScroll={event => { if (active) scrollTop.current = event.currentTarget.scrollTop; }}>
    <ModelsPage provider={provider} revision={revision}
      onModelsChanged={onModelsChanged}
      filters={{q:params.get('q') ?? undefined, enabled:params.get('enabled') ?? undefined}}
      onFilter={change} creating={dialog === 'manual'}
      onCreateChange={open => change({add:open ? 'manual' : undefined})}
      onCatalog={() => change({add:'catalog'})} />
    {dialog === 'catalog' && provider.enabled && <ProviderModelPicker provider={provider}
      onClose={() => change({add:undefined})} onManual={() => change({add:'manual'})}
      onImported={({created,skipped}) => {
        message.success(`已添加 ${created} 个模型${skipped ? `，跳过 ${skipped} 个已添加模型` : ''}`);
        change({add:undefined});
        setRevision(v => v+1);
        onModelsChanged();
      }} />}
  </div>;
}
