import type { PlayerDto, ReplayPlayer, ReplayScript } from '@battle/shared';
import { Button } from 'antd';
import { playerLabel } from '../resources/playerLabel';

interface Props { script:ReplayScript; profiles: PlayerDto[]; change:(script:ReplayScript)=>void }
export function ScriptEditor({script,profiles,change}:Props) {
  const setPlayer = (i:number,v:Partial<ReplayPlayer>) => change({...script,players:script.players.map((p,j)=>j===i?{...p,...v}:p)});
  const next = () => Array.from({length:64},(_,i)=>i+1).find(n=>!script.players.some(p=>p.seat===n));
  const topic = script.topic ?? {title:''};
  return <details className="replay-settings"><summary>阵容与对局设置 · {script.players.length} 位玩家</summary>
    <label>对局名称<input value={script.title} onChange={e=>change({...script,title:e.target.value})}/></label>
    {script.gameKey==='debate' && <div className="replay-fields">{(['title','pro','con'] as const).map((k,i)=><label key={k}>{['辩题','正方立场','反方立场'][i]}
      <input value={topic[k]??''} onChange={e=>change({...script,topic:{...topic,[k]:e.target.value}})}/></label>)}</div>}
    {script.players.map((p,i)=><div className="replay-fields roster" key={i}>
      <label>座号<input type="number" min="1" max="64" value={p.seat} onChange={e=>setPlayer(i,{seat:Number(e.target.value)})}/></label>
      <label>剧本姓名<input value={p.name} onChange={e=>setPlayer(i,{name:e.target.value})}/></label>
      <label>绑定玩家<select value={p.playerId??''} onChange={e=>setPlayer(i,{playerId:Number(e.target.value)||undefined})}><option value="">默认形象</option>
        {profiles.map(x=><option value={x.id} key={x.id}>{playerLabel(x)}</option>)}</select></label>
      <label>身份<input value={p.role??''} onChange={e=>setPlayer(i,{role:e.target.value||undefined})}/></label>
      <label>阵营<select value={p.team??''} onChange={e=>setPlayer(i,{team:e.target.value||undefined})}><option value="">默认</option>
        {(script.gameKey==='debate'?[['pro','正方'],['con','反方'],['judge','评委']]:[['good','好人'],['werewolf','狼人'],['third','第三方']]).map(([k,v])=><option key={k} value={k}>{v}</option>)}
        {p.team && !['pro','con','judge','good','werewolf','third'].includes(p.team) && <option>{p.team}</option>}</select></label>
      {script.gameKey==='debate' && <label>辩位<input type="number" value={p.position??''} onChange={e=>setPlayer(i,{position:Number(e.target.value)||undefined})}/></label>}
      <Button onClick={()=>change({...script,players:script.players.filter((_,j)=>i!==j)})}>移除</Button>
    </div>)}
    <Button disabled={!next()} onClick={()=>change({...script,players:[...script.players,{seat:next()!,name:'新玩家'}]})}>添加玩家</Button>
    <div className="replay-fields"><label>胜方（选填）<input value={script.result?.winnerLabel ?? script.result?.winner ?? ''} onChange={e=>change({...script,result:{...script.result,winner:undefined,winnerLabel:e.target.value||undefined}})}/></label>
      <label>MVP（选填）<select value={script.result?.mvp??''} onChange={e=>change({...script,result:{...script.result,mvp:Number(e.target.value)||undefined}})}>
        <option value="">无记录</option>{script.players.map((p,i)=><option key={i} value={p.seat}>{p.seat} 号 · {p.name}</option>)}</select></label>
      <label>终局摘要<input value={script.result?.summary??''} onChange={e=>change({...script,result:{...script.result,summary:e.target.value||undefined}})}/></label></div>
  </details>;
}
