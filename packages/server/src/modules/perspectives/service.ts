import { formatHistoryEntry, seatCanSee } from '@battle/engine';
import { gameRegistry, nightActionPrompts } from '@battle/games';
import { describeEvent, speechOf, type PerspectiveEvent, type PerspectiveMatch, type PerspectiveRecord, type StageEvent } from '@battle/shared';
import { notFound } from '../../utils/errors';
import { visibleToPlayerSeat } from '../realtime/perspective';
import type { perspectiveRepository } from './repository';

const kinds: Record<StageEvent['kind'], string> = {
  phase_started: '阶段', narration: '法官通知', action: '行动', speech: '发言', judgement: '点评',
  vote_tallied: '计票', seat_eliminated: '出局', revealed: '揭示', game_over: '终局', fallback: '兜底',
};
const spec = gameRegistry.get('werewolf')!.spec;
const actionNames = new Map(nightActionPrompts.map(a => [a.phase, a.role + ' · ' + a.title]));

function summarize(event: StageEvent): PerspectiveEvent {
  const spoken = speechOf(event);
  const { seats } = event.view;
  const actor = 'seat' in event ? event.seat : null;
  const phase = event.phaseId ?? '';
  const definition = spec.phases[phase];
  const action = definition && 'action' in definition ? definition.action : null;
  const label = event.kind === 'action' ? event.action : event.kind === 'phase_started' && event.announcement ? '法官口令' : kinds[event.kind];
  return {
    seq: event.seq, round: event.round, phase,
    phaseTitle: actionNames.get(phase) ?? definition?.title ?? action ?? event.view.phase?.title ?? '对局阶段',
    channel: event.channel, label: actor === null ? label : `${actor}号 · ${label}`,
    text: describeEvent(event).text ?? ('text' in event ? event.text : label),
    aiHistoryText: formatHistoryEntry(event, n => seats.find(s => s.seat === n)?.label ?? n + '号'),
    spoken: spoken?.text ?? null,
    voice: !spoken ? null : spoken.seat === null ? '法官' : spoken.seat + '号',
    roles: Object.fromEntries(seats.map(s => [s.seat, s.roleName])),
    aiSeats: seats.filter(s => seatCanSee(event.channel, s)).map(s => s.seat),
    playerSeats: seats.filter(s => visibleToPlayerSeat(event, s.seat)).map(s => s.seat),
  };
}

export function perspectiveService(repository: ReturnType<typeof perspectiveRepository>) {
  return {
    actions: () => nightActionPrompts,
    async prompt(id: string, request: string) {
      const row = await repository.prompt(id, request);
      if (!row) throw notFound('该局的请求记录');
      return row.prompt;
    },
    async matches(offset: number, limit: number): Promise<PerspectiveMatch[]> {
      return (await repository.matches(offset, limit)).map(row => ({
        id: row.id, title: row.importTitle ?? spec.variants?.[row.variantKey ?? '']?.name ?? '狼人杀',
        createdAt: row.createdAt.toISOString(),
      }));
    },
    async record(id: string): Promise<PerspectiveRecord> {
      const data = await repository.record(id);
      if (!data) throw notFound('狼人杀对局');
      const events = data.events.filter(e => e.channel !== 'host' && e.kind !== 'fallback').map(summarize);
      if (data.imported) for (const event of events) event.aiSeats = [];
      return { seats: data.seats, requests: data.requests, requestsAvailable: data.requestsAvailable, events };
    },
  };
}
