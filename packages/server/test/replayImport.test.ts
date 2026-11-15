import { readFile } from 'node:fs/promises';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { speechOf,type MatchSummaryDto,type ReplayDocument,type ReplayDraft,type ReplayEntry,type ReplayPreview } from '@battle/shared';
import { createTestApp,dataOf,type TestApp } from './support/testApp';
import { seedPlayers } from './support/fixtures';
import { listen,watch } from './support/stream';

const base='/api/admin/replay-imports';
const lines=['第一夜','预言家3号查验5号，查验结果为好人。','狼人选择刀6号','女巫救下6号，天亮为平安夜','3号：我昨晚验了5号，他是好人。','这是我的原话。','6号出局','5号公开身份为村民'];
describe('文件导入与现有回放服务',()=>{
  let t:TestApp,token:string, server:Awaited<ReturnType<typeof listen>>, doc:ReplayDocument;
  let modelResponse='';
  const requests:string[]=[];
  beforeAll(async()=>{
    t=await createTestApp({}, {llm:{complete:async request=>{
      requests.push(request.messages.at(-1)!.content);return {content:modelResponse,usage:null};
    }}});
    server=await listen(t);token=await t.adminToken();
  });
  afterAll(async()=>{await server?.close();await t?.cleanup();});
  async function upload(name:string,bytes:Uint8Array|string, game='werewolf') {
    const form=new FormData();form.set('gameKey',game);form.set('file',new Blob([typeof bytes==='string'?bytes:new Uint8Array(bytes)]),name);
    const res=await t.app.request(base+'/parse',{method:'POST',headers:{Authorization:'Bearer '+token},body:form});
    const body=await res.json() as {data:ReplayDocument;message:string};expect(res.status,JSON.stringify(body)).toBe(200);return body.data as ReplayDocument;
  }
  it('四种文件在舞台上逐事件一致，包括 Word 表格和跨段发言',async()=>{
    doc=await upload('第一夜.txt',lines.join('\n'));
    const md=await upload('第一夜.md',['# '+lines[0],...lines.slice(1)].join('\n'));
    const word=await upload('第一夜.docx',await readFile(new URL('./support/replay-night.docx',import.meta.url)));
    const json=await upload('第一夜.json',JSON.stringify(doc.script));
    const preview=(document:ReplayDocument)=>t.services.replayImports.preview(document,0);
    const expected=await preview(doc);
    for(const d of [md,word,json]) expect(await preview(d)).toEqual(expected);
    expect(expected.events.map(e=>e.kind)).toEqual(['phase_started','action','revealed','revealed','narration','speech','seat_eliminated','revealed']);
    expect(speechOf(expected.events[5]!)?.text).toBe('我昨晚验了5号，他是好人。\n这是我的原话。');
    expect(expected.events[5]!.view.seats.find(s=>s.seat===6)?.alive).toBe(true);
    expect(expected.events[6]!.view.seats.find(s=>s.seat===6)?.alive).toBe(false);
    expect(expected.events[6]!.view.publicRoles).toEqual([]);
    expect(expected.events[7]!.view.publicRoles).toEqual([5]);
  });
  it('保留 JSON 原文，精确定位错误，空白页和损坏文档返回校对提示', async () => {
    const literal = '{ "kind": "speech", "seat": 3, "text": "原话 { } [ ] \\"events\\":" }';
    const raw = '{"version":1,"gameKey":"werewolf","title":"events","players":[{"seat":3,"name":"阿青"}],"events":[' + literal + ']}';
    const parsed = await upload('原文.json',raw);
    expect(parsed.originalJson).toBe(raw);
    expect(parsed.sources).toEqual([literal]);
    const parse = (text:string) => t.services.replayImports.parse('错误.json',Buffer.from(text),'werewolf');
    await expect(parse(raw.replace('"seat": 3','"seat": -1'))).rejects.toThrow('events.0.seat');
    await expect(t.services.replayImports.preview({...parsed,script:{...parsed.script,players:[]}},0)).rejects.toThrow('events.0');
    await expect(t.services.replayImports.parse('空白.docx',Buffer.from('invalid'),'werewolf')).rejects.toThrow('Word 正文无法读取');
    const unresolved = await upload('别名.txt','主持人：开始。\n阿青：等一下！');
    expect(unresolved.script.events.at(-1)?.kind).toBe('pending');
  });
  it('拒绝匿名草稿读写，保持版本，重复发布同一历史，视角过滤先于语音与动效',async()=>{
    expect((await t.call('GET',base)).status).toBe(401);
    const saved=dataOf(await t.call<ReplayDraft>('POST',base,{token,body:doc}));
    expect((await t.call('GET',base+'/'+saved.id)).status).toBe(401);
    expect((await t.call('POST',base+'/'+saved.id+'/publish',{body:{revision:1}})).status).toBe(401);
    const before=dataOf(await t.call<MatchSummaryDto[]>('GET','/api/toc/matches'));
    expect(before).toHaveLength(0);
    const edited=structuredClone(doc); edited.script.players.find(p=>p.seat===3)!.role='预言家';
    const updated=dataOf(await t.call<ReplayDraft>('PUT',base+'/'+saved.id,{token,body:{revision:1,document:edited}}));
    const publish=()=>t.call<{matchId:string}>('POST',base+'/'+saved.id+'/publish',{token,body:{revision:updated.revision}});
    const ids=(await Promise.all([publish(),publish()])).map(r=>dataOf(r).matchId);
    expect(ids[1]).toBe(ids[0]);
    expect((await t.call('PUT',base+'/'+saved.id,{token,body:{revision:1,document:doc}})).status).toBe(409);
    const history=dataOf(await t.call<MatchSummaryDto[]>('GET','/api/toc/matches'));
    expect(history.map(m=>m.importTitle)).toEqual(['第一夜']);
    const god=await watch(server.port,ids[0]!,0), player=await watch(server.port,ids[0]!,0,Infinity,10000,6);
    expect(god.events).toHaveLength(8);expect(player.events.map(e=>e.seq)).toEqual([1,5,6,7,8]);
    expect(player.events[0]!.view.seats.find(s=>s.seat===3)?.role).toBeNull();
    expect(player.end).toEqual({type:'end',result:null});
  });
  it('对局记录按正常、调试、导入来源过滤并在分页前应用',async()=>{
    const imported = await t.db.selectFrom('matches').selectAll().where('importTitle','is not',null).executeTakeFirstOrThrow();
    const copy = {...imported,seed:Number(imported.seed),params:JSON.stringify(imported.params),snapshot:JSON.stringify(imported.snapshot),result:imported.result === null ? null : JSON.stringify(imported.result)};
    const normalId = imported.id + '_normal', debugId = imported.id + '_debug';
    await t.db.insertInto('matches').values([
      {...copy,id:normalId,importTitle:null,debug:false},
      {...copy,id:debugId,importTitle:null,debug:true,scripted:true},
    ]).execute();
    const list = async (source:string) => dataOf(await t.call<MatchSummaryDto[]>('GET', '/api/admin/matches?source='+source+'&status=completed&limit=1',{token}));
    expect((await list('normal')).map(m=>m.id)).toEqual([normalId]);
    expect((await list('debug')).map(m=>m.id)).toEqual([debugId]);
    expect((await list('import')).map(m=>m.id)).toEqual([imported.id]);
    expect(dataOf(await t.call<MatchSummaryDto[]>('GET','/api/admin/matches?source=normal&offset=1',{token}))).toEqual([]);
    expect((await t.call('GET','/api/admin/matches?source=unknown',{token})).status).toBe(400);
  });
  it('辩位、评委原话、绑定的形象和音色；未处理段落必须校对',async()=>{
    const profileId=(await seedPlayers(t,1))[0]!;
    const d=await upload('片段.txt','待归属的开场\n正方二辩：第一段。\n第二段。\n反方三辩：我回应。\n评委：论据充分。','debate');
    expect(d.script.events.map(e=>e.seat)).toEqual([undefined,2,7,9]);
    const player=d.script.players[0]!;player.playerId=profileId;player.name='剧本别名';
    const saved=await t.services.replayImports.save(d);
    await expect(t.services.replayImports.publish(saved.id,1)).rejects.toThrow('尚待处理');
    d.script.events[0]!.kind='ignored';
    const p=dataOf(await t.call<ReplayPreview>('POST',base+'/preview',{token,body:{document:d,from:2}}));
      expect(p.start).toBe(1);expect(p.events[0]!.view.seats[0]).toMatchObject({name:'剧本别名',team:'pro',position:2,appearanceName:'#'+profileId});
    expect(speechOf(p.events.at(-1)!)?.text).toBe('论据充分。');
    await t.services.replayImports.save(d,saved.id,1);const {matchId}=await t.services.replayImports.publish(saved.id,2);
    const seat=await t.db.selectFrom('matchSeats').selectAll().where('matchId','=',matchId).where('seat','=',2).executeTakeFirstOrThrow();
    expect(seat.voiceId).toBe((await t.services.players.get(profileId)).voiceId);
    const modelId=(await t.services.models.list())[0]!.id;
    modelResponse='无效回复'; const ask=()=>t.call<ReplayEntry[]>('POST',base+'/suggest',{token,body:{document:d,selected:[0],modelId}});
    expect((await ask()).status).toBe(502);
    modelResponse=JSON.stringify({events:[{kind:'narration',text:d.sources[0],sources:[0]}]});
    expect(dataOf(await ask())[0]?.sources).toEqual([0]);expect(requests.at(-1)).not.toContain('我回应');
  });
});
