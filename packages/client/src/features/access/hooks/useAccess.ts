import { API_ERROR_CODES } from '@battle/shared';
import { useEffect, useRef, useState } from 'react';
import { createAccessSession, fetchAccessProfile } from '../../../services/access';
import { ApiError, errorMessage } from '../../../services/http';
import { clearAccess, readAccess, writeAccess } from '../stores/accessStore';
import type { AccessContinuation, StoredAccess } from '../types';

/**
 * 开局凭证：本机缓存的凭证、输码对话框、输码后继续原来的动作。
 * 进入页面时向服务端刷新一次持有人信息；凭证已失效则清除。
 */
export function useAccess() {
  const [access, setAccess] = useState<StoredAccess | null>(() => readAccess());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const continuation = useRef<AccessContinuation | null>(null);

  const forget = () => {
    clearAccess();
    setAccess(null);
  };

  useEffect(() => {
    const stored = access;
    if (!stored) return;
    let cancelled = false;
    fetchAccessProfile(stored.token).then((profile) => {
      if (cancelled) return;
      const next = { ...stored, ...profile };
      writeAccess(next);
      setAccess(next);
    }, (cause: unknown) => {
      if (!cancelled && cause instanceof ApiError && cause.code === API_ERROR_CODES.unauthorized) forget();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在进入页面时刷新一次
  }, []);

  /** 打开输码对话框；reason 用于说明为什么需要（如凭证失效） */
  const request = (next: AccessContinuation, reason: string | null = null) => {
    continuation.current = next;
    setNotice(reason);
    setError(null);
    setDialogOpen(true);
  };

  const submit = async (code: string) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { token, tokenExpiresAt, username, expiresAt, remainingMatches } = await createAccessSession(code);
      const next: StoredAccess = { token, tokenExpiresAt, username, expiresAt, remainingMatches };
      writeAccess(next);
      setAccess(next);
      setDialogOpen(false);
      const pending = continuation.current;
      continuation.current = null;
      pending?.(token);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  };

  return {
    access,
    dialogOpen,
    notice,
    submitting,
    error,
    request,
    submit,
    cancel: () => {
      continuation.current = null;
      setDialogOpen(false);
    },
    /** 服务端拒绝了当前凭证：清除后重新要码 */
    reject: (reason: string, next: AccessContinuation) => {
      forget();
      request(next, reason);
    },
    signOut: forget,
  };
}

export type AccessState = ReturnType<typeof useAccess>;
