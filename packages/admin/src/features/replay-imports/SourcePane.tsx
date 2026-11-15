import type { ModelDto, ReplayDocument, ReplayEntry } from '@battle/shared';
import { Button } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { replayApi } from '../../services/replayImports';
import { errorMessage } from '../../services/http';

interface Props {doc:ReplayDocument; models:ModelDto[]; index:number; change:(events:ReplayEntry[],index:number)=>void }
export function SourcePane({doc,models,index,change}:Props) {
  const [selected,setSelected]=useState<number[]>([]),[model,setModel]=useState(0);
  const [suggestions,setSuggestions]=useState<ReplayEntry[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const container=useRef<HTMLDivElement>(null);
  const refs=doc.script.events[index]?.sources;
  useEffect(()=>{ container.current?.querySelector('[data-current="true"]')?.scrollIntoView({block:'nearest'}); },[index,refs]);
  const replace = (entries:ReplayEntry[])=>{
    const covered = new Set(entries.flatMap(e=>e.sources??[]));
    const remaining = new Set(entries);
    const events: ReplayEntry[] = [];
    for (const original of doc.script.events) {
      const refs = original.sources ?? [];
      if (!refs.some(i => covered.has(i))) { events.push(original); continue; }
      for (const ref of refs) {
        for (const candidate of remaining) {
          if (candidate.sources?.[0] !== ref) continue;
          events.push(candidate);
          remaining.delete(candidate);
        }
        if (!covered.has(ref)) events.push({kind:'pending',text:doc.sources[ref]!,sources:[ref]});
      }
    }
    events.push(...remaining);
    change(events,events.indexOf(entries[0]!));
    setSuggestions([]);setSelected([]);
  };
  async function suggest() {
    setError('');setBusy(true);setSuggestions([]);
    try {setSuggestions(await replayApi.suggest(doc,selected,model));} catch(e){setError(errorMessage(e));} finally{setBusy(false);}
  }
  return <section className="replay-pane"><h3>原文 <small>{doc.filename}</small></h3>
    {doc.originalJson && <details><summary>查看完整 JSON</summary><pre className="replay-json">{doc.originalJson}</pre></details>}
    <div className="replay-sources" ref={container}>{doc.sources.map((line,i)=>line.trim() && <label key={i} data-current={refs?.includes(i)??false}>
      <input type="checkbox" disabled={busy} checked={selected.includes(i)} onChange={e=>{setSuggestions([]);setSelected(e.target.checked?[...selected,i]:selected.filter(n=>n!==i));}}/>
      <small>{i+1}</small><span>{line}</span></label>)}</div>
    <div className="replay-actions"><Button disabled={!selected.length || busy} onClick={()=>{const ids=selected.slice().sort((a,b)=>a-b);replace([{kind:'pending',text:ids.map(i=>doc.sources[i]).join('\n'),sources:ids}]);}}>整理所选段落</Button>
      <select aria-label="辅助解析模型" value={model} disabled={busy} onChange={e=>setModel(Number(e.target.value))}><option value={0}>选择辅助模型</option>
        {models.filter(m=>m.enabled).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select>
      <Button disabled={!selected.length||!model} loading={busy} onClick={suggest}>AI 辅助识别</Button></div>
    {error && <p role="alert">{error}</p>}{suggestions.length>0 && <div><h4>待确认的候选事件</h4>
      {suggestions.map((s,i)=><p key={i}>段落 {s.sources?.map(n=>n+1).join('、')} · {s.kind} {s.seat && s.seat+'号'}　{s.text}</p>)}
      <Button onClick={()=>replace(suggestions)}>采用候选</Button></div>}</section>;
}
