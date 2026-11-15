import type { AudienceSeat, AudienceView, GameResult, ReplayDocument, ReplayEntry, StageEvent, StagePayload } from '@battle/shared';
import { gameRegistry } from '@battle/games';
import { badRequest } from '../../utils/errors';
import { validateTimeline } from './validate';

export interface BoundProfile { id: number; appearanceName: string | null; avatar: string | null; voiceId: number | null }
const skills = {
  inspect: ['seer_check','查验','inspect'], attack: ['wolf_kill','狼刀','blade'],
  save: ['witch_save','解药','heal'], poison: ['witch_poison','毒药','poison'],
} as const;

function roleOf(game: string, value?: string) {
  const match = Object.entries(gameRegistry.get(game)?.spec.roles ?? {}).find(([id, role]) => id === value || role.name === value);
  return { role: match?.[0] ?? value ?? null, roleName: match?.[1].name ?? value ?? null, team: match?.[1].team ?? null };
}

function payload(e: ReplayEntry): StagePayload {
  const { text } = e;
  switch (e.kind) {
    case 'phase': return { kind: 'phase_started', title: text };
    case 'speech': return { kind: 'speech', seat: e.seat!, text };
    case 'judgement': return { kind: 'judgement', seat: e.seat!, verdict: '', verdictLabel: e.value ?? '', comment: text };
    case 'eliminate': return { kind: 'seat_eliminated', seat: e.target!, reason: text };
    case 'reveal': case 'sheriff': return { kind: 'revealed', text, data: { seat: e.target, title: e.value ?? text } };
    case 'attack': case 'save': case 'poison': case 'inspect': {
      const [,title,effect] = skills[e.kind];
      if (e.seat !== undefined) return { kind: 'action', seat: e.seat, targets: [e.target!], action: title, text };
      return { kind: 'revealed', text, data: { effect, title, target: e.target } };
    }
    default: return { kind: 'narration', text };
  }
}

/** 每条事件持有自己的座位快照。技能意图与公开结算分别推进。 */
export function compileReplay(document: ReplayDocument, profiles: BoundProfile[], preview = false, from = 0) {
  validateTimeline(document, preview);
  const { script } = document, debate = script.gameKey === 'debate';
  const events: StageEvent[] = [], publicRoles = new Set<number>();
  let seats: AudienceSeat[] = script.players.map(p => {
    const bound = profiles.find(v => v.id === p.playerId);
    if (p.playerId && !bound) throw badRequest(p.seat + ' 号绑定的玩家已不存在，请重新选择');
    const identity = roleOf(script.gameKey, p.role);
    const team = p.team ?? (debate ? p.seat <= 4 ? 'pro' : p.seat <= 8 ? 'con' : 'judge' : identity.team);
    if (debate) publicRoles.add(p.seat);
    const appearanceName = bound ? bound.appearanceName ?? '#' + bound.id : String((p.seat - 1) % 13 + 1).padStart(2, '0') + ' 号模拟玩家';
    return { seat: p.seat, name: p.name, label: p.seat + '号 ' + p.name, appearanceName,
      avatar: bound?.avatar ?? null, alive: true, role: identity.role, roleName: identity.roleName,
      team, position: p.position ?? (debate ? (p.seat-1)%4+1 : null) };
  }).sort((a,b) => a.seat-b.seat);
  let round = 1, phase: AudienceView['phase'] = null, period = 'day', sheriff: number | null = null, start = 0;
  const view = (result: GameResult | null): AudienceView => ({ gameKey: script.gameKey, title: script.title, round, phase, seats,
    status: result ? 'completed' : 'running', publicRoles: [...publicRoles], extra: { period, sheriff, topic: script.topic }, result });
  for (const [i,e] of script.events.entries()) {
    if (i === from) start = events.length;
    if (e.kind === 'ignored' || e.kind === 'pending') continue;
    if (e.kind === 'phase') {
      phase = { id: e.phaseId ?? e.text, title: e.text };
      round = e.round ?? round;
      if (/夜/.test(e.text)) period = 'night';
      if (/天|白昼/.test(e.text)) period = 'day';
    }
    if (e.kind === 'narration' && /^天亮/.test(e.text) && e.visibility !== 'spectator') period = 'day';
    if (e.kind === 'sheriff') sheriff = e.target!;
    if (e.kind === 'reveal') {
      publicRoles.add(e.target!);
      const identity = roleOf(script.gameKey, e.value);
      seats = seats.map(p => p.seat === e.target ? { ...p, ...identity, team: identity.team ?? p.team } : p);
    }
    if (e.kind === 'eliminate') seats = seats.map(p => p.seat === e.target ? { ...p, alive:false } : p);
    const skill = e.kind === 'inspect' || e.kind === 'attack' || e.kind === 'save' || e.kind === 'poison' ? skills[e.kind] : null;
    events.push({ ...payload(e), seq: events.length+1, round, phaseId: skill?.[0] ?? phase?.id ?? null,
      channel: e.visibility ?? (skill ? 'spectator' : 'public'), view: view(null),
      ...(e.kind === 'inspect' ? { inspectionResult: e.value! } : {}) });
  }
  const r = script.result;
  const result: GameResult | null = r && (r.winner || r.winnerLabel || r.mvp || r.summary) ? {
    winner: r.winner ?? null, winnerLabel: r.winnerLabel ?? r.winner ?? '回放结束', summary: r.summary ?? '', mvp: r.mvp ?? null, endReason: 'normal',
  } : null;
  if (result) events.push({ kind: 'game_over', seq: events.length+1, round, phaseId: phase?.id ?? null, channel: 'public', view: view(result), result });
  return { events, start, result };
}
