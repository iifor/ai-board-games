import type { GameVariantItem } from '@battle/shared';
import { useState } from 'react';
import { filterVariants } from '../utils';
import './BoardPicker.css';

interface BoardPickerProps {
  readonly variants: readonly GameVariantItem[];
  readonly value: string | null;
  readonly onChange: (key: string) => void;
}

/** 板子列表：可按名称或角色搜索，每张卡片显示角色构成 */
export function BoardPicker({ variants, value, onChange }: BoardPickerProps) {
  const [query, setQuery] = useState('');
  const visible = filterVariants(variants, query);
  return (
    <section className="board-picker" aria-label="选择板子">
      <div className="board-picker-head">
        <h2 className="hud-label">选择板子 · {variants.length} 个</h2>
        <label className="board-picker-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input type="search" placeholder="搜板子或角色" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
      </div>
      <div className="board-picker-list" role="radiogroup">
        {visible.map((variant) => (
          <button
            key={variant.key}
            type="button"
            role="radio"
            aria-checked={variant.key === value}
            className={`board-card ${variant.key === value ? 'is-selected' : ''}`}
            onClick={() => onChange(variant.key)}
          >
            <span className="board-card-head">
              <strong>{variant.name}</strong>
              <span>{variant.players.min === variant.players.max ? `${variant.players.max} 人` : `${variant.players.min}–${variant.players.max} 人`}</span>
            </span>
            {variant.roles.length ? (
              <span className="board-card-roles">
                {variant.roles.map((role) => (
                  <i key={role.name} className={`board-role is-${role.team || 'none'}`}>{role.name}{role.count > 1 ? ` ×${role.count}` : ''}</i>
                ))}
              </span>
            ) : null}
            {variant.description && variant.key === value ? <span className="board-card-desc">{variant.description}</span> : null}
          </button>
        ))}
        {visible.length === 0 ? <p className="board-picker-empty">没有匹配的板子</p> : null}
      </div>
    </section>
  );
}
