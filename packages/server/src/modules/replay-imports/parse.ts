import { replayDocumentSchema, replayScriptSchema, type ReplayDocument, type ReplayEntry, type ReplayGame, type ReplayPlayer, type ReplayScript } from '@battle/shared';
import { badRequest } from '../../utils/errors';
import { parseWith } from '../../utils/validate';
import { wordParagraphs } from './docx';
import { eventSourceText } from './json-source';
import { ruling, speaker } from './document-rules';

function documentScript(gameKey: ReplayGame, title: string, sources: string[]): ReplayScript {
  const players: ReplayPlayer[] = [], events: ReplayEntry[] = [];
  const script: ReplayScript = { version: 1, gameKey, title, players, events };
  function ensure(seat: number) {
    if (players.some(p => p.seat === seat)) return;
    players.push({ seat, name: seat + '号', ...(gameKey === 'debate' ? { team: seat <= 4 ? 'pro' : seat <= 8 ? 'con' : 'judge', position: (seat-1)%4+1 } : {}) });
  }
  let continuation: ReplayEntry | undefined;
  const titlePrefix = /^(?:#{1,6}\s+|[-*]\s+)/;
  sources.forEach((original, index) => {
    let line = original.trim().replace(titlePrefix,'');
    if (!line) return;
    if (line.startsWith('|') && line.endsWith('|')) line = line.slice(1,-1).split('|').map(x => x.trim()).join('\t');
    const add = (entry: ReplayEntry) => {
      for (const n of [entry.seat, entry.target]) if (n !== undefined) ensure(n);
      const sourced = { ...entry, sources: [index] };
      events.push(sourced);
      continuation = ['speech','judgement','narration'].includes(entry.kind) ? sourced : undefined;
    };
    const roster = /^(?:玩家|座位)\s*(\d+)\s*号?\s*[：:\t]\s*(.+)$/s.exec(line);
    if (roster) {
      const seat = Number(roster[1]), name = roster[2]!.trim();
      const existing = players.find(p => p.seat === seat);
      ensure(seat);
      if (existing && existing.name !== seat + '号' && existing.name !== name) players.push({ seat, name });
      else players.find(p => p.seat === seat)!.name = name;
      return add({ kind: 'ignored', text: line });
    }
    const topic = /^(辩题|正方观点|反方观点)[：:]\s*(.+)$/.exec(line);
    if (topic) {
      script.topic ??= { title };
      script.topic[topic[1] === '辩题' ? 'title' : topic[1] === '正方观点' ? 'pro' : 'con'] = topic[2]!;
      return add({ kind: 'ignored', text: line });
    }
    const judgeRecord = /^(?:法官(?:记录|裁定)?)[：:]\s*(.+)$/s.exec(line);
    const decisions = judgeRecord && ruling(judgeRecord[1]!);
    if (decisions) { decisions.forEach(add); continuation = undefined; return; }
    const named = /^(\d+)\s*号[ \t·]+([^：:\t]{1,60})[：:][ \t]*(.*)$/s.exec(line);
    if (named) {
      const seat = Number(named[1]), name = named[2]!.trim();
      ensure(seat);
      const player = players.find(p => p.seat === seat)!;
      if (player.name === seat + '号') player.name = name;
      if (player.name !== name) return add({ kind:'pending', text:original });
      return add({ kind:'speech', seat, text:named[3]! });
    }
    const turn = speaker(line, players);
    if (turn) return add(turn);
    const actions = ruling(line);
    if (actions) { actions.forEach(add); continuation = undefined; return; }
    const win = /^(正方|反方|狼人|好人)(?:阵营)?(?:胜出|获胜|胜利)[。！]?$/.exec(line);
    if (win) {
      script.result = { ...script.result, winner: ({ 正方:'pro',反方:'con',狼人:'werewolf',好人:'good' } as Record<string,string>)[win[1]!], winnerLabel: win[1]!, summary: line };
      return add({ kind: 'ignored', text: line });
    }
    const mvp = /^(?:MVP|最佳辩手)[：:]\s*(\d+)\s*号[。.]?$/i.exec(line);
    if (mvp) { ensure(+mvp[1]!); script.result = { ...script.result, mvp: +mvp[1]! }; return add({ kind: 'ignored', text: line }); }
    if (continuation && !/^[^。！？\n]{1,40}[：:\t]|^(?:第.+[天夜轮]|狼人|女巫|法官|预言家)\s*\d/.test(line)) {
      continuation.text += (continuation.text ? '\n' : '') + original;
      continuation.sources!.push(index);
    } else add({ kind: 'pending', text: original });
  });
  return script;
}

export async function parseReplay(filename: string, bytes: Buffer, game: ReplayGame, profiles: readonly { id: number; name: string | null }[]): Promise<ReplayDocument> {
  const ext = filename.split('.').at(-1)?.toLowerCase(), title = filename.replace(/\.[^.]+$/, '').slice(0,160) || '导入对局';
  const readText = () => {
    try { return new TextDecoder('utf-8',{ fatal:true }).decode(bytes); } catch { throw badRequest('请将文本保存为 UTF-8 编码'); }
  };
  let script: ReplayScript, sources: string[], originalJson: string | undefined;
  if (ext === 'json') {
    let raw: unknown;
    originalJson = readText();
    try { raw = JSON.parse(originalJson); } catch { throw badRequest('文件不是有效的 UTF-8 JSON'); }
    script = parseWith(replayScriptSchema, raw);
    sources = eventSourceText(originalJson);
    script.events.forEach((e,i) => { e.sources = [i]; });
  } else {
    if (!['md','txt','docx'].includes(ext ?? '')) throw badRequest('请选择 JSON、DOCX、TXT 或 Markdown 文件');
    sources = ext === 'docx' ? await wordParagraphs(bytes) : readText().split(/\r\n|\r|\n/);
    if (sources.length > 12000) throw badRequest('原文最多支持 12000 段');
    script = documentScript(game,title,sources);
  }
  if (!script.events.length) throw badRequest('文件没有可校对的内容');
  for (const p of script.players) {
    const matches = profiles.filter(x => x.name === p.name);
    if (p.playerId === undefined && matches.length === 1 && script.players.filter(other => other.name === p.name).length === 1) p.playerId = matches[0]!.id;
  }
  const document = parseWith(replayDocumentSchema, { filename, sources, script, originalJson });
  if (Buffer.byteLength(JSON.stringify(document)) > 10 * 1024 * 1024) throw badRequest('展开后的剧本超过 10 MiB，请拆分文件');
  return document;
}
