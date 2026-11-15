import { ANNOUNCEMENT_MAX_LENGTH, ANNOUNCEMENT_TEMPLATE_MAX_LENGTH, type AnnouncementItem } from '@battle/shared';
import { Alert, Button, Input, Modal, Space } from 'antd';
import { useState } from 'react';
import { announcements } from '../../services/announcements';
import { errorMessage } from '../../services/http';
import { useAnnouncementPreview } from './useAnnouncementPreview';
import { RelatedActions } from '../perspectives/RelatedActions';

interface Props {
  readonly item: AnnouncementItem;
  readonly inline: boolean;
  readonly draft: string;
  readonly revision: number;
  readonly onDraft: (value: string) => void;
  readonly onClose: () => void;
  readonly onSaved: (saved: AnnouncementItem) => void;
}

export function AnnouncementEditor({ item, inline, draft, revision, onDraft, onClose, onSaved }: Props) {
  const current = item.customText ?? item.defaultText;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const text = draft.trim();
  const { problem, preview } = useAnnouncementPreview(item, text);
  const variables = Object.entries(item.examples);

  async function save() {
    if (saving || !preview || text === current) return;
    setSaving(true);
    setError('');
    try {
      const saved = await announcements.save(item.key, {
        text: text === item.defaultText ? null : text, revision,
      });
      onSaved(saved);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  const actions = <div className="announcement-actions">
      <Button type="link" disabled={saving || draft === item.defaultText} onClick={() => onDraft(item.defaultText)}>恢复默认</Button>
      <Space><Button disabled={saving || (inline && draft === current && !error)} onClick={() => { setError(''); onClose(); }}>{inline ? '撤销修改' : '取消'}</Button>
        <Button type="primary" loading={saving} disabled={!preview || text === current} onClick={save}>保存</Button></Space>
    </div>;
  const form = <div className="announcement-editor">
      <p className="announcement-scope">{item.group} · {item.audience === 'public' ? '全场公开' : '女巫私讯，上帝视角可见'}</p>
      <div className="announcement-composer">
      <div className="announcement-field"><label htmlFor="announcement-text">播报文案</label>
        <Input.TextArea id="announcement-text" value={draft} disabled={saving} rows={inline ? 5 : 3} showCount maxLength={item.engineTemplate ? ANNOUNCEMENT_TEMPLATE_MAX_LENGTH : ANNOUNCEMENT_MAX_LENGTH}
          status={problem ? 'error' : ''} aria-invalid={!!problem} onChange={event => { onDraft(event.target.value); setError(''); }} />
        {variables.length > 0 && <p className="announcement-variables">可用变量　{variables.map(([name, example]) => <span key={name}><code>{item.engineTemplate ? `{{${name}}}` : `{${name}}`}</code>（例如 {example}）</span>)}</p>}
      </div>
      <div className="announcement-preview"><strong>播报预览</strong>
        {preview ? <p>{preview}</p> : problem ? <p role="alert">{problem}</p> : <p role="status">正在预览…</p>}
      </div>
      </div>
      {item.group === '夜间叫号' && <RelatedActions callKey={item.key} />}
      <p className="announcement-scope">保存后从新开对局生效。</p>
      {error && <Alert type="error" title={error} showIcon />}
    </div>;
  if (inline) return <aside className="announcement-inspector" aria-labelledby="announcement-selected-title">
    <h2 id="announcement-selected-title">{item.title}</h2>
    {form}
    {actions}
  </aside>;
  return <Modal open title={`编辑播报 · ${item.title}`} width={620}
    onCancel={() => { if (!saving) onClose(); }} closable={!saving} keyboard={!saving} footer={actions}>
    {form}
  </Modal>;
}
