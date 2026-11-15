import { importKinds, type ReplayDocument, type ReplayEntry } from '@battle/shared';
import { Button } from 'antd';

const names:Record<ReplayEntry['kind'],string> = {phase:'阶段',speech:'玩家发言',narration:'主持播报',inspect:'查验',attack:'狼刀',save:'解药',poison:'毒药',eliminate:'出局',reveal:'公开身份',sheriff:'移交警徽',judgement:'评委点评',pending:'待处理',ignored:'忽略'};
interface Props {doc:ReplayDocument; index:number; pick:(i:number)=>void; change:(entries:ReplayEntry[])=>void; preview:()=>void}
export function Timeline({doc,index,pick,change,preview}:Props) {
  const {events,players} = doc.script, e=events[index];
  if (!e) return null;
  const set=(v:Partial<ReplayEntry>)=>change(events.map((entry,i)=>i===index?{...entry,...v}:entry));
  const move=(delta:number)=>{
    const copy=events.slice(); copy.splice(index,1); copy.splice(index+delta,0,e); change(copy); pick(index+delta);
  };
  return <section className="replay-pane"><h3>播放时间线 <small>{events.length} 条</small></h3>
    <ol className="replay-event-list">{events.map((entry,i)=><li key={i}><button type="button" aria-current={index===i} onClick={()=>pick(i)}>
      <b>{i+1} · {names[entry.kind]}</b> {entry.text}</button></li>)}</ol>
    <div className="replay-fields"><label>事件类型<select value={e.kind} onChange={v=>set({kind:v.target.value as ReplayEntry['kind']})}>
      {importKinds.map(k=><option key={k} value={k}>{names[k]}</option>)}</select></label>
      {(['seat','target'] as const).map(k=><label key={k}>{k==='seat'?'发言／行动人':'目标'}<select value={e[k]??''} onChange={v=>set({[k]:Number(v.target.value)||undefined})}>
        <option value="">未指定</option>{players.map((p,i)=><option key={i} value={p.seat}>{p.seat} 号 · {p.name}</option>)}</select></label>)}
      <label>可见范围<select value={e.visibility??''} onChange={v=>set({visibility:(v.target.value||undefined) as ReplayEntry['visibility']})}>
        <option value="">按类型</option><option value="public">公开</option><option value="spectator">仅上帝视角</option></select></label>
      {['inspect','reveal','judgement'].includes(e.kind) && <label>结果／身份<input value={e.value??''} onChange={v=>set({value:v.target.value||undefined})}/></label>}
      {e.kind==='phase' && <label>轮次<input type="number" min={1} value={e.round??''} onChange={v=>set({round:Number(v.target.value)||undefined})}/></label>}</div>
    <label>事件原话<textarea rows={4} value={e.text} onChange={v=>set({text:v.target.value})}/></label>
    <div className="replay-actions"><Button disabled={index===0} onClick={()=>move(-1)}>上移</Button>
      <Button disabled={index===events.length-1} onClick={()=>move(1)}>下移</Button><Button onClick={()=>set({kind:'ignored'})}>忽略此项</Button>
      <Button onClick={preview}>从此处试播</Button></div></section>;
}
