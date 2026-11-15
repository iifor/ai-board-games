import { useLayoutEffect, useState, type RefObject } from 'react';
import { NODE_HEIGHT, NODE_WIDTH, type layoutRules } from './layout';

interface Props {
  model: ReturnType<typeof layoutRules>;
  selected: string;
  scale: number;
  viewport: RefObject<HTMLDivElement | null>;
  board: RefObject<HTMLDivElement | null>;
  onNavigate: (point: { x: number; y: number }) => void;
}

export function RuleOverview({ model, selected, scale, viewport, board, onNavigate }: Props) {
  const [frame, setFrame] = useState({ x: 0, y: 0, width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = viewport.current;
    const canvas = board.current;
    if (!el || !canvas) return;
    const measure = () => {
      const left = (el.scrollLeft - canvas.offsetLeft) / scale;
      const top = (el.scrollTop - canvas.offsetTop) / scale;
      const x = Math.max(0, left), y = Math.max(0, top);
      setFrame({ x, y, width: Math.max(0, Math.min(model.width, left + el.clientWidth / scale) - x),
        height: Math.max(0, Math.min(model.height, top + el.clientHeight / scale) - y) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    el.addEventListener('scroll', measure, { passive: true });
    return () => { el.removeEventListener('scroll', measure); observer.disconnect(); };
  }, [board, viewport, scale, model]);
  return <svg className="phase-overview" role="img" aria-label="全图导航，蓝框为当前画布范围"
    viewBox={`0 0 ${model.width} ${model.height}`} onClick={event => {
      const transform = event.currentTarget.getScreenCTM();
      if (transform) onNavigate(new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse()));
    }}>
    {model.edges.map(e => <polyline key={JSON.stringify([e.from,e.to])} points={e.points} />)}
    {model.nodes.map(n => <rect key={n.phase.id} x={n.x - NODE_WIDTH / 2} y={n.y - NODE_HEIGHT / 2}
      width={NODE_WIDTH} height={NODE_HEIGHT} fill={n.phase.id === selected ? '#165ca9' : '#8b9fb7'} />)}
    <rect {...frame} className="phase-overview-frame" />
  </svg>;
}
