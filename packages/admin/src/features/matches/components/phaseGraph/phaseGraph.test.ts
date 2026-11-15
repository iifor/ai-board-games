import { expect, it } from 'vitest';
import type { PhaseGraphDto, TraceNodeDto } from '@battle/shared';
import { layoutRules } from './layout';
import { announcedVisits, recordedVisits } from './visits';

it('renders each declared transition including loops, disconnected components and reserved targets', () => {
  const rule: PhaseGraphDto = {gameKey:'test', start:'a', phases:[
    {id:'a', kind:'act', title:null, next:['a','b','return']},
    {id:'b', kind:'compute', title:null, next:['a','end']},
    {id:'separate', kind:'speak', title:'遗言', next:['return']},
  ]};
  const chart = layoutRules(rule);
  expect(chart.nodes.map(n => n.phase.id).sort()).toEqual(['a','b','end','return','separate']);
  expect(chart.edges.map(e => e.from+'→'+e.to).sort()).toEqual(['a→a','a→b','a→return','b→a','b→end','separate→return']);
  expect(chart.edges.every(e => e.points && !e.points.includes('NaN'))).toBe(true);
});

it('keeps repeated entries, the original round and node link; only explicit announcements are used in old logs', () => {
  const base: TraceNodeDto = {kind:'phase',id:3,round:1,phaseId:'night_reset',label:'night_reset',visit:1,
    seat:null,seq:null,requestIds:[],inputRequestId:null,createdAt:''};
  const visits = recordedVisits([base,{...base,id:4,kind:'stage'},{...base,id:5,visit:2},{...base,id:9,visit:3,round:2}]);
  expect(visits.map(v => [v.round,v.visit,v.nodeId])).toEqual([[1,1,3],[1,2,5],[2,3,9]]);
  expect(visits[0]?.title).toBe('夜间状态重置');
  const meta = {seq:10,round:2,phaseId:'wolf_chat',channel:'public' as const};
  expect(announcedVisits([{...meta,kind:'phase_started',title:'狼人夜聊'},{...meta,seq:11,kind:'narration',text:'播报'}]))
    .toEqual([{round:2,phaseId:'wolf_chat',seq:10,title:'狼人夜聊'}]);
});
