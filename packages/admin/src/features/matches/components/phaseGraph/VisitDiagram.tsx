import { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { PhaseVisit } from './visits';
import './VisitDiagram.css';

export function VisitDiagram({ visits, matchId }: { visits: readonly PhaseVisit[]; matchId: string }) {
  const grid = useRef<HTMLOListElement>(null);
  const [capacity, setCapacity] = useState(1);
  useLayoutEffect(() => {
    if (!grid.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setCapacity(Math.max(1, Math.floor((entry.contentRect.width + 32) / (176 + 32))));
    });
    observer.observe(grid.current);
    return () => observer.disconnect();
  }, []);
  const columns = Math.min(capacity, visits.length);
  return <div className="visit-viewport">
    <ol ref={grid} className="visit-diagram" aria-label="按发生顺序排列的阶段"
      style={{gridTemplateColumns: 'repeat(' + columns + ', minmax(0, 196px))'}}>
      {visits.map((visit, index) => {
        const recorded = visit.nodeId !== undefined;
        const row = Math.floor(index / columns);
        const reverse = recorded && row % 2 === 1;
        const position = index % columns;
        const column = reverse ? columns - position : position + 1;
        const direction = position === columns - 1 ? 'down' : reverse ? 'left' : 'right';
        const content = <>
          <small>第 {index + 1} 步{visit.visit !== undefined && visit.visit > 1 && ' · 第 ' + visit.visit + ' 次进入'}</small>
          <strong>{visit.title}</strong><code>{visit.phaseId}</code>
          <span>{recorded ? '查看调用链 ↗' : '事件 #' + visit.seq}</span>
        </>;
        return <li key={visit.nodeId ?? visit.seq} style={{gridColumn: column, gridRow: row + 1}}>
          {recorded ? <Link className="visit-card" preventScrollReset
            aria-label={'第 ' + (index + 1) + ' 步，查看' + visit.title + '的调用链'}
            to={'/matches/' + encodeURIComponent(matchId) + '?tab=trace&node=' + visit.nodeId}>{content}</Link>
            : <div className="visit-card">{content}</div>}
          {recorded && index + 1 < visits.length && <span className="visit-arrow" data-direction={direction} aria-hidden="true" />}
        </li>;
      })}
    </ol>
  </div>;
}
