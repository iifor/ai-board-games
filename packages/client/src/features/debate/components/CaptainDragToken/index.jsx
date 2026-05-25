import React from 'react';
import { Crown } from 'lucide-react';
import { classNames } from '../../../../utils/classNames';
import './index.css';

export function CaptainDragToken({ tone, disabled = false }) {
  return (
    <span
      className={classNames('team-captain-token', disabled && 'locked')}
      draggable={!disabled}
      title="拖到本方选手卡上设置队长"
      onDragStart={(event) => {
        if (disabled) return;
        event.dataTransfer.setData('text/plain', `captain:${tone}`);
        event.dataTransfer.effectAllowed = 'move';
      }}
    >
      <Crown size={15} />
      队长
    </span>
  );
}
