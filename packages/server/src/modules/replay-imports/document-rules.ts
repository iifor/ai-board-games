import type { ReplayEntry, ReplayPlayer } from '@battle/shared';

export function ordinal(raw: string): number {
  if (/^\d+$/.test(raw)) return Number(raw);
  const digits = '零一二三四五六七八九';
  const [tens, ones] = raw.split('十');
  return ones === undefined ? digits.indexOf(raw) : (digits.indexOf(tens || '一') * 10) + digits.indexOf(ones || '零');
}

export function speaker(line: string, players: ReplayPlayer[]): Pick<ReplayEntry, 'kind' | 'seat' | 'text'> | null {
  const heading = /^(?:(\d+)\s*号(?:玩家)?发言|(正方|反方)([一二三四])辩|主持人|评委(?:点评)?)$/.test(line);
  const parts = /^([^：:\t\n]{1,80})[：:\t][ \t]*(.*)$/s.exec(heading ? line+'：' : line);
  if (!parts) return null;
  const who = parts[1]!.trim(), text = parts[2]!;
  if (/^(主持人?|法官|旁白)(?:播报)?$/.test(who)) return { kind: 'narration', text };
  const numbered = /^(\d+)\s*号(?:玩家)?(?:发言)?$/.exec(who);
  if (numbered) return { kind: 'speech', seat: Number(numbered[1]), text };
  const side = /^(正方|反方)([一二三四1-4])辩$/.exec(who);
  if (side) {
    const team = side[1] === '正方' ? 'pro' : 'con', position = ordinal(side[2]!);
    return { kind: 'speech', seat: players.find(p => p.team === team && p.position === position)?.seat ?? position + (team === 'con' ? 4 : 0), text };
  }
  if (/^评委(?:点评)?$/.test(who)) return { kind: 'judgement', seat: players.find(p => p.team === 'judge')?.seat ?? 9, text };
  const names = players.filter(p => p.name === who);
  return names.length === 1 ? { kind: 'speech', seat: names[0]!.seat, text } : null;
}

export function ruling(line: string): ReplayEntry[] | null {
  const dusk = /^(第[零一二三四五六七八九十\d]+[天夜轮])(?:[，,、：:]\s*(.+))?$/s.exec(line);
  if (dusk) {
    const title = dusk[1]!, rest = dusk[2];
    return [{ kind: 'phase', text: title, round: ordinal(title.slice(1,-1)), phaseId: title.endsWith('夜') ? 'night' : title.endsWith('天') ? 'day' : 'debate_round' },
      ...(rest ? ruling(rest) ?? [{ kind: 'pending' as const, text: rest }] : [])];
  }
  if (/^(立论|攻辩|自由辩论|总结陈词|白天发言|竞选发言|天亮|黑夜)[。！]?$/.test(line)) return [{ kind: 'phase', text: line }];
  const inspect = /^预言家\s*(\d+)\s*号\s*(?:查验|验了?)\s*(\d+)\s*号[，,：:\s]*(?:查验)?(?:结果)?(?:为|是)?\s*(好人|狼人|坏人)[。.]?$/.exec(line);
  if (inspect) return [{ kind: 'inspect', seat: +inspect[1]!, target: +inspect[2]!, value: inspect[3]!, text: line }];
  const action = /^(狼人|女巫)\s*(?:(\d+)\s*号)?\s*(?:选择)?(刀|击杀|救下|救了|使用解药救|毒杀|毒了)\s*(\d+)\s*号(?:[，,；;]\s*(天亮.*))?[。.]?$/.exec(line);
  if (action) {
    const kind = /救/.test(action[3]!) ? 'save' : /毒/.test(action[3]!) ? 'poison' : 'attack';
    return [{ kind, seat: action[2] ? +action[2] : undefined, target: +action[4]!, text: line.split(/[，,；;]/)[0]! },
      ...(action[5] ? [{ kind: 'narration' as const, text: action[5] }] : [])];
  }
  const out = /^(?:天亮[，,：:]?\s*)?(\d+)\s*号(?:玩家)?(?:死亡|出局|被放逐|被淘汰)[。.]?$/.exec(line);
  if (out) return [{ kind: 'eliminate', target: +out[1]!, text: line }];
  const flip = /^(\d+)\s*号(?:公开身份|翻牌|亮明身份)[为是：:\s]*(.+?)[。.]?$/.exec(line);
  if (flip) return [{ kind: 'reveal', target: +flip[1]!, value: flip[2]!, text: line }];
  const badge = /^(?:警徽(?:移交|转交|传给)|警长当选[：:])\s*(\d+)\s*号[。.]?$/.exec(line);
  if (badge) return [{ kind: 'sheriff', target: +badge[1]!, text: line }];
  if (/^(?:天亮[，,：:为]?)?(?:昨夜)?平安夜[。！]?$/.test(line)) return [{ kind: 'narration', text: line }];
  return null;
}
