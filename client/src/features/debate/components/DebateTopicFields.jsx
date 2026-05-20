import React from 'react';
import './DebateTopicFields.css';

export function DebateTopicFields({ topic, disabled, onChange }) {
  return (
    <section className="debate-topic-fields">
      <label>
        <span>辩题 <b>*</b></span>
        <input value={topic.title} onChange={(event) => onChange('title', event.target.value)} placeholder="请输入本场辩题" disabled={disabled} />
      </label>
      <div className="debate-position-row">
        <label>
          <span>正方 <b>*</b></span>
          <input value={topic.proPosition} onChange={(event) => onChange('proPosition', event.target.value)} placeholder="请输入正方观点" disabled={disabled} />
        </label>
        <label>
          <span>反方 <b>*</b></span>
          <input value={topic.conPosition} onChange={(event) => onChange('conPosition', event.target.value)} placeholder="请输入反方观点" disabled={disabled} />
        </label>
      </div>
    </section>
  );
}
