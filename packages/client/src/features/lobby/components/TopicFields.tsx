import type { TopicDraft } from '../hooks/useMatchSetup';
import './TopicFields.css';

interface TopicFieldsProps {
  readonly topic: TopicDraft;
  readonly onChange: (next: TopicDraft) => void;
  readonly incomplete: boolean;
}

/** 可选的自定义辩题；留空则由服务端从题库抽取 */
export function TopicFields({ topic, onChange, incomplete }: TopicFieldsProps) {
  const field = (key: keyof TopicDraft, label: string, max: number) => (
    <label>
      {label}
      <input value={topic[key]} maxLength={max} onChange={(event) => onChange({ ...topic, [key]: event.target.value })} />
    </label>
  );
  return (
    <fieldset className="topic-fields">
      <legend>自定义辩题（可选）</legend>
      {field('title', '辩题', 100)}
      {field('pro', '正方观点', 200)}
      {field('con', '反方观点', 200)}
      {incomplete ? <p className="topic-fields-hint">请把三项都填写完整，或全部留空</p> : null}
    </fieldset>
  );
}
