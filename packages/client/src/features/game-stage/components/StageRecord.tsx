import type { StreamItem } from '../types';
import { EventFeed, type FeedFilter } from './EventFeed';
import './StageRecord.css';

interface StageRecordProps {
  readonly items: readonly StreamItem[];
  readonly title?: string;
  readonly filter?: FeedFilter;
  readonly onFilter?: (filter: FeedFilter) => void;
  readonly onClose: () => void;
}

export function StageRecord({ items, title = '对局记录', filter = 'all', onFilter, onClose }: StageRecordProps) {
  return (
    <aside className="stage-record glass-panel" aria-label={title}>
      <header>
        <h2>{title}</h2>
        {onFilter && <div className="stage-feed-filters" role="group" aria-label="筛选">
          <button type="button" className={filter === 'all' ? 'is-active' : ''} aria-pressed={filter === 'all'} onClick={() => onFilter('all')}>全部</button>
          <button type="button" className={filter === 'speech' ? 'is-active' : ''} aria-pressed={filter === 'speech'} onClick={() => onFilter('speech')}>只看发言</button>
        </div>}
        <button type="button" className="stage-feed-close" aria-label={`收起${title}`} onClick={onClose}>×</button>
      </header>
      <EventFeed items={items} filter={filter} />
    </aside>
  );
}
