import type { TraceRequestDto } from '@battle/shared';
import { Modal } from 'antd';
import { useState } from 'react';
import { PromptComparisonForm } from './PromptComparisonForm';

interface Props {
  readonly initialCallId?: number | undefined;
  readonly matchId: string;
  readonly request: TraceRequestDto;
  readonly onClose: () => void;
}

export function PromptComparisonDialog({ matchId, request, initialCallId, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  return <Modal open title={initialCallId ? `调试模型调用 #${initialCallId} · ${request.seat} 号` : `调试这条请求 · ${request.seat} 号`} width={940} footer={null}
    onCancel={onClose} closable={!busy} keyboard={!busy} maskClosable={!busy}>
    <PromptComparisonForm key={request.id} matchId={matchId} request={request} initialCallId={initialCallId} onBusy={setBusy} />
  </Modal>;
}
