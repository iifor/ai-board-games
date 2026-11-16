import { useRef, useState } from 'react';
import { useDialogFocus } from '../../../hooks/useDialogFocus';
import { ACCESS_CODE_MAX_LENGTH } from '../constants';
import './AccessCodeDialog.css';

interface AccessCodeDialogProps {
  /** 为什么需要输码，如凭证失效；为空时显示默认说明 */
  readonly notice: string | null;
  readonly error: string | null;
  readonly submitting: boolean;
  readonly onSubmit: (code: string) => void;
  readonly onCancel: () => void;
}

/** 输入身份码：开局需要管理员发放的身份码，观战与回放不需要 */
export function AccessCodeDialog({ notice, error, submitting, onSubmit, onCancel }: AccessCodeDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const [code, setCode] = useState('');
  useDialogFocus(dialogRef, onCancel);
  const trimmed = code.trim();
  return (
    <section ref={dialogRef} className="access-dialog" role="dialog" aria-modal="true" aria-labelledby="access-dialog-title" tabIndex={-1}>
      <form className="access-dialog-card glass-panel" onSubmit={(event) => { event.preventDefault(); if (trimmed) onSubmit(trimmed); }}>
        <h2 id="access-dialog-title">输入身份码开局</h2>
        <p className="access-dialog-notice">{notice ?? '开局会调用 AI 模型，需要管理员发放的身份码。观战和回放不需要身份码。'}</p>
        <label className="access-dialog-field">
          身份码
          <input value={code} maxLength={ACCESS_CODE_MAX_LENGTH} autoComplete="off" autoCapitalize="characters" spellCheck={false}
            placeholder="XXXX-XXXX-XXXX-XXXX" onChange={(event) => setCode(event.target.value)} />
        </label>
        {error ? <p className="access-dialog-error" role="alert">{error}</p> : null}
        <div className="access-dialog-actions">
          <button type="button" className="button" onClick={onCancel}>取消</button>
          <button type="submit" className="button button-primary" disabled={!trimmed || submitting}>{submitting ? '正在验证…' : '验证并开局'}</button>
        </div>
      </form>
    </section>
  );
}
