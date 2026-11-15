import { Empty, Input } from 'antd';
import { useState, type ReactNode } from 'react';

interface Item {
  key: string;
  label: string;
  description?: string;
  detail: ReactNode;
}

interface Props {
  label: string;
  searchPlaceholder: string;
  items: readonly Item[];
  selected: string;
  onSelect: (key: string) => void;
  tools?: ReactNode;
}

export function ResourceNavigation({ label, searchPlaceholder, items, selected, onSelect, tools }: Props) {
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const shown = items.filter(item => `${item.label} ${item.description ?? ''}`.toLowerCase().includes(query));

  return <nav className="resource-navigation" aria-label={label}>
    <div className="resource-navigation-tools">
      {tools}
      <Input.Search aria-label={searchPlaceholder} placeholder={searchPlaceholder} allowClear
        value={search} onChange={event => setSearch(event.target.value)} />
    </div>
    <div className="resource-navigation-items">
      {shown.map(item => (
        <button type="button" key={item.key} aria-current={item.key === selected ? 'true' : undefined}
          onClick={() => onSelect(item.key)}>
          <strong>{item.label}</strong>
          {item.description && <small title={item.description}>{item.description}</small>}
          <span>{item.detail}</span>
        </button>
      ))}
      {!shown.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有符合条件的来源" />}
    </div>
  </nav>;
}
