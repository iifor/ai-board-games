import type { ReplayPreview } from '@battle/shared';
import { Modal } from 'antd';
import { useEffect, useRef } from 'react';
import { publicOrigin } from '../../utils/publicApp';

export function StagePreview({preview,close}:{preview:ReplayPreview;close:()=>void}) {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    function ready(e: MessageEvent) {
      if (e.origin === publicOrigin && e.source === frame.current?.contentWindow && e.data === 'replay-preview-ready') {
        frame.current?.contentWindow?.postMessage({type:'replay-preview',preview},publicOrigin);
      }
    }
    window.addEventListener('message',ready);
    return () => window.removeEventListener('message',ready);
  },[preview]);
  return <Modal open title="舞台试播" footer={null} width="96vw" onCancel={close}>
    <iframe ref={frame} title="静音舞台试播" src={publicOrigin+'/import-preview'} className="replay-preview-frame" />
  </Modal>;
}
