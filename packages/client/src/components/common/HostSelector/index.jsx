import React from 'react';
import { buildHostOptions, normalizeHostId } from '../../../utils/player';

export function HostSelector({
  players = [],
  selectedHostId = 'default',
  onChange,
  className = '',
  listClassName = '',
  title = '主持人设置',
  description = '可将任意 AI 玩家设为本局主持人',
  defaultLabel = '默认主持人'
}) {
  const hostOptions = buildHostOptions(players, defaultLabel);
  const selected = String(normalizeHostId(selectedHostId));
  return (
    <section className={className}>
      <div className="player-pool-head">
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <div className={listClassName}>
        {hostOptions.map((host) => (
          <button
            type="button"
            className={selected === String(host.id) ? 'active checked' : ''}
            onClick={() => onChange?.(host.id)}
            key={host.id}
          >
            <span>{host.badge}</span>
            <strong>{host.name}</strong>
            <em>{host.description}</em>
          </button>
        ))}
      </div>
    </section>
  );
}
