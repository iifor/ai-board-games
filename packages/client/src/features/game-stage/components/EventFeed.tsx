import { useEffect, useRef } from 'react';
import { describeEvent } from '../playback/describe';
import type { StreamItem } from '../types';
import './EventFeed.css';

/** 已播放事件的记录，新内容出现时只在列表内部滚动到底部（不带动整页） */
export function EventFeed({ items }: { readonly items: readonly StreamItem[] }) {
  const listRef = useRef<HTMLOListElement | null>(null);
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [items.length]);

  return (
    <ol className="event-feed" ref={listRef}>
      {items.map(({ event }) => {
        const { speaker, text } = describeEvent(event);
        if (!text) return null;
        const seat = speaker === null ? null : event.view.seats.find((candidate) => candidate.seat === speaker);
        return (
          <li key={event.seq} className={`event-feed-${event.kind}`}>
            {event.kind === 'phase_started' ? <strong>{text}</strong> : <><span>{seat ? seat.label : '主持人'}</span>{text}</>}
          </li>
        );
      })}
    </ol>
  );
}
