import type { ModelDto, PlayerDto, ReplayDocument, ReplayDraft, ReplayPreview } from '@battle/shared';
import { Alert, Button, Modal, Space, Spin } from 'antd';
import { useEffect, useState } from 'react';


import { modelsApi,playersApi } from '../../services/resources';
import { errorMessage } from '../../services/http';
import { replayApi } from '../../services/replayImports';
import { publicMatchUrl } from '../../utils/publicApp';
import { ReplayUpload } from './ReplayUpload';

import { ReplayTemplateViewer } from './ReplayTemplateViewer';
import { ScriptEditor } from './ScriptEditor';
import { SourcePane } from './SourcePane';
import { StagePreview } from './StagePreview';
import { Timeline } from './Timeline';
import './import.css';

export function ReplayImportModal({onClose,onImported}: {onClose:()=>void; onImported:()=>void}) {

  const [doc,setDoc]=useState<ReplayDocument|null>(null);
  const [draft,setDraft]=useState<ReplayDraft|null>(null);

  const [players,setPlayers]=useState<PlayerDto[]>([]),[models,setModels]=useState<ModelDto[]>([]);
  const [index,pick]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [preview,setPreview]=useState<ReplayPreview|null>(null),[edition,setEdition]=useState(0);
  const dirty = !!doc && doc !== draft?.document;

  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, busy]);
  useEffect(()=>{
    let active=true;
    Promise.all([playersApi.list(),modelsApi.list()]).then(([p,m])=>{
      if(active){setPlayers(p);setModels(m);}
    }).catch(e=>{if(active)setError(errorMessage(e));});
    return ()=>{active=false;};
  },[]);
  async function run(fn:()=>Promise<void>) {
    setBusy(true);setError('');
    try{await fn();}catch(e){setError(errorMessage(e));}finally{setBusy(false);}
  }
  function open(document:ReplayDocument,saved:ReplayDraft|null) {
    setDoc(document);setDraft(saved);pick(0);setEdition(v=>v+1);
  }
  async function save() {
    if (!doc) return;
    const saved = draft && doc === draft.document ? draft : await replayApi.save(doc,draft);
    setDraft(saved);setDoc(saved.document);
    await replayApi.publish(saved);
    onImported();
  }
  function mayReplace() {return !dirty || window.confirm('放弃当前未保存的校对内容？');}
  return <Modal open title="导入对局" width="min(1600px, 94vw)" footer={null} closable={!busy} keyboard={!busy} maskClosable={!busy} onCancel={() => { if (mayReplace()) onClose(); }}><section className="replay-import" aria-label="导入对局">
    <div className="replay-toolbar">
      <Space wrap>
        <ReplayUpload busy={busy} onImport={(file, game) => {
          if (mayReplace()) void run(async () => open(await replayApi.parse(file, game), null));
        }} />
        <ReplayTemplateViewer />
      </Space>
      <small>支持 JSON、TXT、MD、DOCX，最大 4 MiB</small>
    </div>
    {error && <Alert type="error" showIcon title={error}/>}
    {busy && <Spin size="small" aria-label="正在处理对局" />}
    {doc && <><header className="replay-bar"><strong>{doc.script.title}</strong><span>{doc.script.events.filter(e=>e.kind==='pending').length} 项待处理</span>
      <Button disabled={busy} onClick={()=>run(async()=>setPreview(await replayApi.preview(doc,0)))}>静音试播</Button>
      {draft?.matchId ? <a href={publicMatchUrl(draft.matchId)} target="_blank" rel="noreferrer">观看已发布回放 ↗</a>
        : <><Button type="primary" disabled={busy} onClick={()=>run(save)}>完成导入</Button></>}
    </header><fieldset className="replay-edit" disabled={busy||!!draft?.matchId}>
      <ScriptEditor script={doc.script} profiles={players} change={script=>setDoc({...doc,script})}/>
      <div className="replay-columns"><SourcePane key={edition} doc={doc} models={models} index={index} change={(events,i)=>{setDoc({...doc,script:{...doc.script,events}});pick(i);}}/>
        <Timeline doc={doc} index={index} pick={pick} change={events=>setDoc({...doc,script:{...doc.script,events}})}
          preview={()=>run(async()=>setPreview(await replayApi.preview(doc,index)))}/></div>
    </fieldset></>}
    {preview && <StagePreview preview={preview} close={()=>setPreview(null)}/>}
  </section></Modal>;
}
