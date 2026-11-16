import type { AccessCodeDto, AccessCodeSecret } from '@battle/shared';
import { App } from 'antd';
import { useState } from 'react';
import { useAsync } from '../../hooks/useAsync';
import { accessCodesApi } from '../../services/accessCodes';
import { errorMessage } from '../../services/http';
import type { AccessCodeFormValues, RevealedSecret } from './types';
import { toInput } from './utils';

/** 身份码列表与操作：保存、重新生成、删除；新码生成后交给 revealed 展示一次 */
export function useAccessCodes() {
  const { message } = App.useApp();
  const list = useAsync(accessCodesApi.list, []);
  const [editor, setEditor] = useState<AccessCodeDto | 'new' | null>(null);
  const [saving, setSaving] = useState(false);
  const [revealed, setRevealed] = useState<RevealedSecret | null>(null);

  const reveal = ({ accessCode, secret }: AccessCodeSecret) =>
    setRevealed({ username: accessCode.username, secret, expiresAt: accessCode.expiresAt });

  async function run(work: () => Promise<void>): Promise<void> {
    try {
      await work();
      list.reload();
    } catch (error) {
      message.error(errorMessage(error));
    }
  }

  async function save(values: AccessCodeFormValues): Promise<void> {
    const editing = editor === 'new' ? null : editor;
    setSaving(true);
    await run(async () => {
      const input = toInput(values, editing);
      if (editing) {
        await accessCodesApi.update(editing.id, input);
        message.success('已保存');
      } else {
        reveal(await accessCodesApi.create(input));
      }
      setEditor(null);
    });
    setSaving(false);
  }

  return {
    list,
    editor,
    saving,
    revealed,
    openNew: () => setEditor('new'),
    openEdit: (code: AccessCodeDto) => setEditor(code),
    closeEditor: () => setEditor(null),
    closeRevealed: () => setRevealed(null),
    save,
    regenerate: (code: AccessCodeDto) => run(async () => reveal(await accessCodesApi.regenerate(code.id))),
    remove: (code: AccessCodeDto) => run(async () => {
      await accessCodesApi.remove(code.id);
      message.success('已删除');
    }),
  };
}
