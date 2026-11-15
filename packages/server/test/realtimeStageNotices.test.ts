import {describe,expect,it,vi} from 'vitest';
import type {StageEvent} from '@battle/shared';
import {createMatchStream,type StreamMatch} from '../src/modules/realtime';
import {visibleOnStage} from '../src/modules/realtime/perspective';
import {createEventBus} from '../src/utils/eventBus';

const view: StageEvent['view'] = {
  gameKey:'werewolf',title:'狼人杀',round:1,phase:null,status:'running',extra:{},result:null,
  seats:[1,2].map(seat=>({seat,name:`玩家${seat}`,label:`${seat}号`,avatar:null,alive:true,role:null,roleName:null,team:null,position:null})),
};
const notice: StageEvent = {kind:'narration',seq:2,round:1,phaseId:'cupid_bond',channel:'private:1',view,text:'丘比特让你与 2号 成为情侣。'};

describe('丘比特玩家通知不进入前台舞台',()=>{
  it('只过滤狼人杀的情侣关系私讯，保留连线动作和其他通知',()=>{
    expect(visibleOnStage(notice)).toBe(false);
    expect(visibleOnStage({...notice,phaseId:'seer_check'})).toBe(true);
    expect(visibleOnStage({...notice,channel:'public'})).toBe(true);
    expect(visibleOnStage({...notice,view:{...view,gameKey:'debate'}})).toBe(true);
    expect(visibleOnStage({...notice,kind:'action',seat:1,targets:[1,2],action:'连情侣'})).toBe(true);
  });

  for(const status of ['waiting_ai','completed'] as const) {
    it.each([undefined,1])(`${status} 的视角 %s 跳过通知和音频并自动确认，继续发送后续事件`,async viewer=>{
      const events: StageEvent[] = [
        {kind:'action',seq:1,round:1,phaseId:'cupid_link',channel:'private:1',view,seat:1,targets:[1,2],action:'连情侣',text:'让1号与2号成为情侣'},
        notice,
        {...notice,seq:3,channel:'private:2',text:'丘比特让你与 1号 成为情侣。'},
        {...notice,seq:4,phaseId:'seer_check',text:'这是仍需要呈现的其他私讯'},
      ];
      const sent: string[]=[],acked:number[]=[],audio:number[]=[];
      const stream=createMatchStream('notice-fixture',{send:data=>sent.push(data),close:()=>{}},{
        bus:createEventBus(),audio:{audioFor:async(_id,event)=>{audio.push(event.seq);return {url:'/cached-audio/'+event.seq,mime:'audio/mpeg'};}},
        matches:{find:async():Promise<StreamMatch>=>({status,scripted:false,result:null,error:null}),nextEvent:async(_id,after)=>events.find(event=>event.seq>after),markAcked:async(_id,seq)=>{acked.push(seq);}},
      },{pollMs:60000},viewer);
      const messages=()=>sent.map(raw=>JSON.parse(raw) as {type:string;event?:StageEvent});
      try {
        stream.hello(0);
        await vi.waitFor(()=>expect(messages().filter(message=>message.type==='event').map(message=>message.event?.seq)).toEqual([1]));
        stream.ack(1);
        await vi.waitFor(()=>expect(messages().filter(message=>message.type==='event').map(message=>message.event?.seq)).toEqual([1,4]));
        expect(acked).toEqual([1,2,3]);
        expect(audio).not.toContain(2);expect(audio).not.toContain(3);
        expect(events[1]).toMatchObject({kind:'narration',text:notice.text}); // 后台事件及玩家认知来源仍保留。
        stream.ack(4);
        await vi.waitFor(()=>expect(messages().at(-1)?.type).toBe(status==='completed'?'end':'status'));
      } finally {stream.dispose();}
    });
  }
});
