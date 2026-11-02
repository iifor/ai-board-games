import type { PlayerRange } from '../types';
import { readyLabel } from '../utils';
import './SetupActionBar.css';

interface SetupActionBarProps {
  readonly boardName: string;
  readonly count: number;
  readonly range: PlayerRange;
  readonly hint: string | null;
  readonly topicPartial: boolean;
  readonly submitting: boolean;
}

/** 固定在底部的操作条：就座进度 + 开始按钮（表单的 submit） */
export function SetupActionBar({ boardName, count, range, hint, topicPartial, submitting }: SetupActionBarProps) {
  const ready = !hint && !topicPartial;
  const status = topicPartial ? '辩题请填完整或全部留空' : (hint ?? readyLabel(count, range));
  return (
    <div className="setup-action-bar">
      <div className="setup-action-status glass-panel">
        <div className="setup-action-board">
          <span className="hud-label">本局</span>
          <strong>{boardName} · {count} / {range.max} 人已就座</strong>
        </div>
        <i className="setup-action-progress" aria-hidden="true"><b style={{ width: `${Math.min(100, (count / range.max) * 100)}%` }} /></i>
        <span className={`setup-action-hint ${ready ? 'is-ready' : ''}`}>{status}</span>
      </div>
      <button type="submit" className="button button-primary setup-action-submit" disabled={!ready || submitting}>
        {submitting ? '正在开局…' : '开始对局'}
      </button>
    </div>
  );
}
