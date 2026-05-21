import React from 'react';
import './index.css';

export function DebateThinking() {
  return (
    <div className="debate-thinking" role="status" aria-live="polite">
      <div className="debate-thinking-panel">
        <span />
        <strong>正在思考中</strong>
      </div>
    </div>
  );
}
