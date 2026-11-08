import type { GameVariantItem } from '@battle/shared';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { filterVariants } from '../utils';
import './BoardPicker.css';

type RoleStyle = CSSProperties & Record<'--i', number>;

const roleStyle = (index: number): RoleStyle => ({ '--i': index });
const ARROW_STEPS: Readonly<Partial<Record<string, number>>> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };

interface BoardPickerProps {
  readonly variants: readonly GameVariantItem[];
  readonly value: string | null;
  readonly onChange: (key: string) => void;
}

const playerCount = ({ players }: GameVariantItem) => players.min === players.max ? `${players.max} 人` : `${players.min}–${players.max} 人`;

/** 左侧显示当前模式，右侧选择和搜索；过滤列表时仍可确认本局的角色构成。 */
export function BoardPicker({ variants, value, onChange }: BoardPickerProps) {
  const [query, setQuery] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const active = variants.find((variant) => variant.key === value);
  const visible = filterVariants(variants, query);
  const focusKey = visible.find((item) => item.key === value)?.key ?? visible[0]?.key;
  useEffect(() => {
    const panel = list.current;
    if (!panel) return;
    const card = panel.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!card) { panel.scrollTop = 0; return; }
    const delta = card.getBoundingClientRect().top - panel.getBoundingClientRect().top;
    if (delta < 0) panel.scrollTop += delta;
    else if (delta + card.offsetHeight > panel.clientHeight) panel.scrollTop += delta + card.offsetHeight - panel.clientHeight;
  }, [query, value]);
  return (
    <section className="board-picker" aria-label="选择模式">
      {active && <div className="board-current" aria-live="polite">
        <span className="board-current-label">当前模式</span>
        <h3>{active.name} <small>{playerCount(active)}</small></h3>
        <div key={active.key} className="board-card-roles">
          {active.roles.map((role, index) => (
            <span key={role.name} className={`ui-pill ui-pill-soft board-role is-${role.team || 'none'}`} style={roleStyle(index)}>
              {role.name}{role.minCount !== undefined ? ` ×${role.minCount}–${role.count}` : role.count > 1 && ` ×${role.count}`}
            </span>
          ))}
        </div>
        {active.description && <p>{active.description}</p>}
      </div>}
      <div className="board-options">
        <div className="board-picker-head">
          <h2>选择模式 <small>{query.trim() ? `${visible.length} / ${variants.length}` : variants.length} 个</small></h2>
          <label className="board-picker-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input type="search" aria-label="搜索模式或角色" placeholder="搜索模式或角色" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
        </div>
        <div ref={list} className="board-picker-list" role="radiogroup" aria-label="玩法模式">
          {visible.map((variant, index) => (
            <button
              key={variant.key}
              type="button"
              role="radio"
              aria-checked={variant.key === value}
              tabIndex={variant.key === focusKey ? 0 : -1}
              onKeyDown={(event) => {
                const delta = ARROW_STEPS[event.key];
                if (delta === undefined) return;
                event.preventDefault();
                const next = (index + delta + visible.length) % visible.length;
                onChange(visible[next]!.key);
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
              }}
              className={`board-card ${variant.key === value ? 'is-selected' : ''}`}
              onClick={() => onChange(variant.key)}
            >
              <strong>{variant.name}</strong>
              <small>{playerCount(variant)}</small>
            </button>
          ))}
          {visible.length === 0 ? <p className="board-picker-empty" role="status">没有匹配的模式，可以换个名称或角色搜索。</p> : null}
        </div>
      </div>
    </section>
  );
}
