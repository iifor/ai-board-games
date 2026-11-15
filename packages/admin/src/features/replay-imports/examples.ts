import type { ReplayGame, ReplayScript } from '@battle/shared';

export function replayTemplate(gameKey: ReplayGame, example: boolean): ReplayScript {
  const debate = gameKey === 'debate';
  const script: ReplayScript = { version:1, gameKey, title: example ? debate ? '远程办公辩论' : '第一夜' : '我的对局',
    players: debate ? [{seat:1,name:'小林',team:'pro',position:1},{seat:5,name:'小周',team:'con',position:1},{seat:9,name:'评委',team:'judge'}]
      : [{seat:3,name:'小林',role:'预言家',team:'good'},{seat:5,name:'小周'},{seat:6,name:'小陈'}],
    events: debate ? [{kind:'speech',seat:1,text:'我方支持远程办公。'}] : [{kind:'speech',seat:3,text:'我昨晚验了5号，他是好人。'}] };
  if (debate) script.topic = { title:'远程办公是否应该成为常态',pro:'支持',con:'反对' };
  if (example && debate) {
    script.events.push({kind:'speech',seat:5,text:'远程协作也有成本。'},{kind:'judgement',seat:9,text:'双方都给出了具体理由。'});
    script.result = {winner:'pro',winnerLabel:'正方胜出',mvp:1};
  } else if (example) {
    script.events.unshift({kind:'phase',text:'第一夜',round:1},{kind:'inspect',seat:3,target:5,value:'好人',text:'预言家3号查验5号，查验结果为好人。'},
      {kind:'attack',target:6,text:'狼人选择刀6号'},{kind:'save',target:6,text:'女巫救下6号'},{kind:'narration',text:'天亮为平安夜'});
  }
  return script;
}
