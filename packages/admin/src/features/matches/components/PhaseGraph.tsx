import type { MatchDetailDto } from '@battle/shared';
import { Alert, Button, Spin } from 'antd';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useAsync } from '../../../hooks/useAsync';
import { fetchPhaseGraph } from '../../../services/matches';
import './PhaseGraph.css';

const RuleDiagram = lazy(() => import('./phaseGraph/RuleDiagram').then(module => ({default:module.RuleDiagram})));

function Rules({ detail }: { detail: MatchDetailDto }) {
  const graph = useAsync(() => fetchPhaseGraph(detail.gameKey), [detail.gameKey]);
  if (graph.status === 'error') return <Alert type="error" title={graph.message} action={<Button onClick={graph.reload}>重试</Button>} />;
  if (graph.status === 'loading') return <Spin />;
  return <Suspense fallback={<Spin />}><RuleDiagram spec={graph.data} current={detail.phaseId} /></Suspense>;
}

export function PhaseGraph({ detail }: { detail: MatchDetailDto }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let native = false;
    const sync = () => {
      if (document.fullscreenElement === workspace.current) native = true;
      else if (native) {
        native = false;
        dialog.current?.close();
        trigger.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  function show() {
    dialog.current?.showModal();
    setOpen(true);
    // The viewport-sized dialog also works in browsers that restrict native fullscreen.
    if (document.fullscreenEnabled) void workspace.current?.requestFullscreen().catch(() => dialog.current?.focus());
  }
  function close() {
    setOpen(false);
    if (document.fullscreenElement === workspace.current) void document.exitFullscreen();
    else trigger.current?.focus({ preventScroll: true });
  }
  return <>
    <Button ref={trigger} size="small" onClick={show}>全屏查看规则图</Button>
    <dialog ref={dialog} className="phase-rule-dialog" aria-label="规则全图" onClose={close}>
      <div ref={workspace} className="phase-full-workspace">
        <header><strong>规则全图</strong><Button autoFocus onClick={() => dialog.current?.close()}>关闭规则图</Button></header>
        <div className="phase-workspace">{open && <Rules detail={detail} />}</div>
      </div>
    </dialog>
  </>;
}
