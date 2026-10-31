import type { CompiledGame } from '../compiler/compile';
import { phaseTitle, seatLabel } from '../runtime/labels';
import type { EngineSnapshot, Seat, TemplateVars } from '../runtime/types';
import { roleVisibleTo } from '../visibility/roles';
import { projectState } from '../visibility/stateProjection';

export interface SeatContextExtras {
  readonly turn: TemplateVars;
  readonly legalTargets: readonly number[] | null;
}

function seatView(game: CompiledGame, s: EngineSnapshot, seat: Seat, viewer: Seat | null): Record<string, unknown> {
  const visible = roleVisibleTo(game, s, seat, viewer);
  const role = game.spec.roles[seat.role];
  return {
    seat: seat.seat,
    name: seat.profile.name,
    label: seatLabel(game, seat),
    alive: seat.alive,
    role: visible ? seat.role : null,
    roleName: visible ? role?.name ?? seat.role : null,
    team: visible ? seat.team : null,
    position: visible ? seat.position : null,
  };
}

function sharedContext(game: CompiledGame, s: EngineSnapshot, viewer: Seat | null): Record<string, unknown> {
  const seats = s.seats.map((seat) => seatView(game, s, seat, viewer));
  return {
    title: game.spec.title,
    round: s.round,
    phase: { id: s.cursor.phaseId ?? '', title: phaseTitle(game, s.cursor.phaseId) },
    seats,
    aliveSeats: seats.filter((seat) => seat.alive === true),
    params: s.params ?? {},
    state: projectState(game, s.state, viewer),
  };
}

/** 主持播报用的公开上下文：不含任何座位私有信息 */
export function buildPublicContext(game: CompiledGame, s: EngineSnapshot): Record<string, unknown> {
  return sharedContext(game, s, null);
}

/** 某个 AI 玩家可见的模板上下文 */
export function buildSeatContext(
  game: CompiledGame,
  s: EngineSnapshot,
  viewer: Seat,
  extras: SeatContextExtras,
): Record<string, unknown> {
  const base = sharedContext(game, s, viewer);
  const knowsTeammates = Boolean(game.spec.roles[viewer.role]?.knowsTeammates);
  const teammates = knowsTeammates
    ? s.seats.filter((seat) => seat.team === viewer.team && seat.seat !== viewer.seat).map((seat) => seatView(game, s, seat, viewer))
    : [];
  return {
    ...base,
    me: { ...seatView(game, s, viewer, viewer), persona: viewer.profile.persona },
    teammates,
    turn: extras.turn,
    legalTargets: extras.legalTargets ?? [],
  };
}
