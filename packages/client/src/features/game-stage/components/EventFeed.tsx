import { useEffect, useRef } from 'react';
import { describeEvent } from '../playback/describe';
import type { StreamItem } from '../types';
import './EventFeed.css';

export type FeedFilter = 'all' | 'speech';

interface EventFeedProps {
  readonly items: readonly StreamItem[];
  readonly filter?: FeedFilter | undefined;
}

/** 已播放事件的记录；"只看发言"时只保留发言与评委点评。新内容出现时只在列表内部滚动到底部 */
export function EventFeed({ items, filter = 'all' }: EventFeedProps) {
  const listRef = useRef<HTMLOListElement | null>(null);
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [items.length, filter]);

  const visible = filter === 'speech' ? items.filter(({ event }) => event.kind === 'speech' || event.kind === 'judgement') : items;
  return (
    <ol className="event-feed" ref={listRef}>
      {visible.map(({ event }) => {
        const { speaker, text } = describeEvent(event);
        if (!text) return null;
        const seat = speaker === null ? null : event.view.seats.find((candidate) => candidate.seat === speaker);
        return (
          <li key={event.seq} className={`event-feed-${event.kind}`}>
            {event.kind === 'phase_started' ? <strong>{text}</strong> : <><span>{seat ? seat.name : '主持人'}</span>{text}</>}
          </li>
        );
      })}
      {visible.length === 0 ? <li className="event-feed-empty">还没有内容</li> : null}
    </ol>
  );
}
