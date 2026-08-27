import './index.css';
import type { DebateTopic } from '../../../../types';

interface DebateTopicFieldsProps {
  topic: DebateTopic;
  disabled: boolean;
  onChange: (key: keyof DebateTopic, value: string) => void;
}

export function DebateTopicFields({ topic, disabled, onChange }: DebateTopicFieldsProps) {
  return (
    <section className="debate-topic-fields game-form-section">
      <label className="game-field">
        <span>辩题 <b>*</b></span>
        <input className="game-input" value={topic.title} onChange={(event) => onChange('title', event.target.value)} placeholder="请输入本场辩题" disabled={disabled} />
      </label>
      <div className="debate-position-row">
        <label className="game-field">
          <span>正方 <b>*</b></span>
          <input className="game-input" value={topic.proPosition} onChange={(event) => onChange('proPosition', event.target.value)} placeholder="请输入正方观点" disabled={disabled} />
        </label>
        <label className="game-field">
          <span>反方 <b>*</b></span>
          <input className="game-input" value={topic.conPosition} onChange={(event) => onChange('conPosition', event.target.value)} placeholder="请输入反方观点" disabled={disabled} />
        </label>
      </div>
    </section>
  );
}
