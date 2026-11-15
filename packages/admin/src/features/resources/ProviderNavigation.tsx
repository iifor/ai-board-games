import type { ProviderDto } from '@battle/shared';
import { Button } from 'antd';
import { ResourceNavigation } from './ResourceNavigation';
import { StatusTag } from './StatusTag';

export function ProviderNavigation({providers, selected, onSelect, onManage}: {
  providers: readonly ProviderDto[];
  selected: number;
  onSelect: (id:number) => void;
  onManage: () => void;
}) {
  return <ResourceNavigation label="模型供应商" searchPlaceholder="查找供应商"
    selected={String(selected)} onSelect={id => onSelect(Number(id))}
    tools={<Button onClick={onManage}>管理供应商</Button>}
    items={providers.map(provider => ({
      key: String(provider.id),
      label: provider.name,
      description: provider.baseUrl,
      detail: <>{provider.modelCount} 个模型 <StatusTag enabled={provider.enabled} /></>,
    }))} />;
}
