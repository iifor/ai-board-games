import type { AudienceSeat, AudienceView } from '@battle/shared';
import type { CompiledGame } from '../compiler/compile';
import { phaseTitle, seatLabel } from '../runtime/labels';
import type { EngineSnapshot } from '../runtime/types';
import type { RuleContext } from '../spec/context';
import type { AudienceMode } from './channels';
import { roleVisibleTo } from './roles';

export function audienceMode(game: CompiledGame): AudienceMode {
  return game.spec.presentation.audienceView ?? 'public';
}

/** 观众在某一时刻看到的局面：角色按观众视角与终局揭示规则决定是否可见 */
export function buildAudienceView(
  game: CompiledGame,
  s: EngineSnapshot,
  ctx: RuleContext<unknown, unknown>,
): AudienceView {
  const completed = s.status === 'completed';
  const omniscient = audienceMode(game) === 'omniscient';
  const revealRoles = completed && (game.spec.presentation.revealOnEnd ?? []).includes('roles');
  const seats: AudienceSeat[] = s.seats.map((seat) => {
    const visible = omniscient || revealRoles || roleVisibleTo(game, seat, null);
    return {
      seat: seat.seat,
      name: seat.profile.name,
      avatar: seat.profile.avatar,
      label: seatLabel(game, seat),
      alive: seat.alive,
      role: visible ? seat.role : null,
      roleName: visible ? game.spec.roles[seat.role]?.name ?? seat.role : null,
      team: visible ? seat.team : null,
      position: visible ? seat.position : null,
    };
  });
  const phaseId = s.cursor.phaseId;
  return {
    gameKey: game.spec.key,
    title: game.spec.title,
    round: s.round,
    phase: phaseId ? { id: phaseId, title: phaseTitle(game, phaseId) } : null,
    status: completed ? 'completed' : 'running',
    seats,
    extra: game.spec.presentation.view?.(ctx, completed ? 'completed' : 'running') ?? {},
    result: s.result,
  };
}
