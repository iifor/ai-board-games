import type { StreamItem } from '../types';
import { EventFeed, type FeedFilter } from './EventFeed';
import './StageRecord.css';

interface StageRecordProps {
  readonly items: readonly StreamItem[];
  readonly filter: FeedFilter;
  readonly onFilter: (filter: FeedFilter) => void;
  readonly onClose: () => void;
}

export function StageRecord({ items, filter, onFilter, onClose }: StageRecordProps) {
  return (
    <aside className="stage-record glass-panel" aria-label="对局记录">
      <header>
        <h2>对局记录</h2>
        <div className="stage-feed-filters" role="group" aria-label="筛选">
          <button type="button" className={filter === 'all' ? 'is-active' : ''} aria-pressed={filter === 'all'} onClick={() => onFilter('all')}>全部</button>
          <button type="button" className={filter === 'speech' ? 'is-active' : ''} aria-pressed={filter === 'speech'} onClick={() => onFilter('speech')}>只看发言</button>
        </div>
        <button type="button" className="stage-feed-close" aria-label="收起记录" onClick={onClose}>×</button>
      </header>
      <EventFeed items={items} filter={filter} />
    </aside>
  );
}
