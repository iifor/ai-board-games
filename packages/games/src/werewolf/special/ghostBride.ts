import { definePrompts, findResult, speechOutput, type ActDecision, type ComputeOutcome, type SeatReassignment } from '@battle/engine';
import type { WerewolfPhases } from '../phases/types';
import { hasRole } from '../rules/board';
import { canUseNightSkill, nightActors } from '../rules/block';
import { isPackWolf, isWolf, type WerewolfContext } from '../rules/context';
import { addSeatNote } from '../rules/notes';
import { nightAfter } from '../rules/order';
import { inThirdParty } from '../rules/thirdParty';
import { roleName } from '../roles';
import type { WerewolfState } from '../state';
import type { SpecialDescriptor } from './types';

// 鬼魂新娘：第三方（阵营 ghost_bride）。首夜选择新郎，再选择证婚人；新郎与证婚人背叛原有阵营，阵营改为 ghost_bride
// （狼队成员改为"叛变的狼人"，离开狼队），三人组成第三方（state.thirdParty），屠城获胜。新娘与新郎是情侣（lovers.ts）。
// 证婚人私下得知新娘与新郎的身份。之后每晚三人在第三方频道交流；场上的单身狼（第三方以外的狼人）全部出局后，
// 新娘（她出局后新郎，两人都出局后证婚人）每晚可以击杀一名第三方以外的玩家（守护、解药挡不下）。

const ghostBridePrompts = definePrompts({
  ghostBride: [
    '你是{{me.label}}，身份是鬼魂新娘（第三方）。首夜你选择一名玩家作为新郎，再选择一名证婚人：新郎与证婚人背叛原有阵营，与你组成第三方阵营，需要让其他所有玩家出局才能获胜；你与新郎一方出局时另一方殉情。',
    '每晚你们三人可以交流；场上不属于你们的狼人全部出局后，你们每晚可以击杀一名玩家（你和新郎都出局后由证婚人击杀）。',
  ].join(''),
  betrayerWolf: '你是{{me.label}}，原本是狼人，已经背叛狼队，与鬼魂新娘组成第三方阵营：需要让其他所有玩家出局才能获胜（见法官私下告诉你的信息）。',
  ghostBrideGroom: '鬼魂新娘请睁眼，选择一名玩家作为你的新郎。',
  ghostBrideWitness: '请选择一名玩家作为你们的证婚人（不能是你和新郎）。',
  ghostBrideChat: '现在是第 {{round}} 夜，鬼魂新娘、新郎与证婚人请睁眼交流，不超过 80 字。',
  ghostBrideKill: '场上不属于你们阵营的狼人已全部出局：今晚你们可以击杀一名不属于你们阵营的玩家，也可以输出空数组不杀人。',
});

const BRIDE = 'ghost_bride';
const firstNight = (ctx: WerewolfContext): boolean => ctx.round === 1 && hasRole(ctx, BRIDE);

function recordGroom(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  const decision = decisions.find((item) => item.targets.length > 0);
  const groom = decision?.targets[0];
  if (!decision || groom === undefined) return ctx.state;
  return addSeatNote({ ...ctx.state, lovers: [decision.seat, groom] }, decision.seat, `你选择了 ${groom}号 作为新郎。`);
}

/** 背叛原有阵营：狼队成员改为叛变的狼人（离开狼队），其他人只改阵营 */
function betray(ctx: WerewolfContext, seat: number): SeatReassignment {
  return isPackWolf(ctx.seats.get(seat)) ? { seat, role: 'betrayer_wolf' } : { seat, team: BRIDE };
}

function bond(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  const [bride, groom] = ctx.state.lovers;
  const witness = findResult(ctx.results, 'ghost_bride_witness', 'act')?.decisions.flatMap((item) => item.targets)[0];
  if (bride === undefined || groom === undefined || witness === undefined) return {};
  const groomText = `鬼魂新娘 ${bride}号 选你作为新郎：你背叛原有阵营，与她和证婚人 ${witness}号 组成第三方阵营，需要让其他所有玩家出局才能获胜；你与新娘一方出局时另一方随之殉情。`;
  const witnessText = `鬼魂新娘 ${bride}号 与新郎 ${groom}号（身份是${roleName(ctx.seats.get(groom).role)}）结为情侣，你被选为证婚人：你背叛原有阵营，与他们组成第三方阵营，需要让其他所有玩家出局才能获胜；情侣都出局后由你行使击杀。`;
  const members = [bride, groom, witness].sort((a, b) => a - b);
  let state: WerewolfState = { ...ctx.state, thirdParty: { kind: 'lovers', seats: members, core: members } };
  state = addSeatNote(addSeatNote(addSeatNote(state, bride, `证婚人是 ${witness}号。`), groom, groomText), witness, witnessText);
  return {
    state,
    reassign: [betray(ctx, groom), betray(ctx, witness)],
    log: [
      { kind: 'narration', text: groomText, channel: `private:${groom}` },
      { kind: 'narration', text: witnessText, channel: `private:${witness}` },
      { kind: 'narration', text: `鬼魂新娘 ${bride}号、新郎 ${groom}号、证婚人 ${witness}号 组成了第三方阵营。`, channel: `team:${BRIDE}` },
    ],
  };
}

function aliveMembers(ctx: WerewolfContext): number[] {
  return ctx.seats.alive().where((seat) => inThirdParty(ctx, seat.seat)).ids();
}

/** 单身狼全部出局后的击杀者：新娘 → 新郎 → 证婚人中第一个存活且能行动的人 */
function killer(ctx: WerewolfContext): number[] {
  if (ctx.seats.alive().where((seat) => isWolf(seat) && !inThirdParty(ctx, seat.seat)).count() > 0) return [];
  const [bride, groom] = ctx.state.lovers;
  const witness = ctx.state.thirdParty?.seats.find((seat) => seat !== bride && seat !== groom);
  const next = [bride, groom, witness].find((seat) => seat !== undefined && ctx.seats.get(seat).alive);
  return next !== undefined && canUseNightSkill(ctx, ctx.seats.get(next)) ? [next] : [];
}

function applyKill(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  const thirdKill = decisions.flatMap((decision) => decision.targets)[0] ?? null;
  return { ...ctx.state, night: { ...ctx.state.night, thirdKill } };
}

const ghostBridePhases = {
  ghost_bride_link: {
    kind: 'act',
    title: '鬼魂新娘',
    action: '选择新郎',
    enabled: firstNight,
    actors: (ctx) => nightActors(ctx, BRIDE),
    targets: (ctx, seat) => ctx.seats.alive().except(seat),
    prompt: ghostBridePrompts.ghostBrideGroom,
    describe: (_ctx, _seat, targets) => `选择 ${targets[0]}号 作为新郎`,
    apply: recordGroom,
    next: nightAfter('ghost_bride_link'),
  },
  ghost_bride_witness: {
    kind: 'act',
    action: '选择证婚人',
    enabled: firstNight,
    actors: (ctx) => ctx.seats.alive().withRole(BRIDE).where(() => ctx.state.lovers.length === 2),
    targets: (ctx) => ctx.seats.alive().except(...ctx.state.lovers),
    prompt: ghostBridePrompts.ghostBrideWitness,
    describe: (_ctx, _seat, targets) => `选择 ${targets[0]}号 作为证婚人`,
    next: nightAfter('ghost_bride_witness'),
  },
  ghost_bride_bond: { kind: 'compute', enabled: firstNight, run: bond, next: nightAfter('ghost_bride_bond') },
  ghost_bride_chat: {
    kind: 'speak',
    title: '鬼魂新娘夜聊',
    enabled: (ctx) => hasRole(ctx, BRIDE),
    actors: (ctx) => (aliveMembers(ctx).length >= 2 ? aliveMembers(ctx) : []),
    prompt: ghostBridePrompts.ghostBrideChat,
    output: speechOutput({ max: 80 }),
    fallback: () => ({ speech: '今晚先听听大家的想法。' }),
    channel: () => `team:${BRIDE}`,
    next: nightAfter('ghost_bride_chat'),
  },
  ghost_bride_kill: {
    kind: 'act',
    action: '击杀',
    enabled: (ctx) => hasRole(ctx, BRIDE),
    actors: killer,
    targets: (ctx) => ctx.seats.alive().where((seat) => !inThirdParty(ctx, seat.seat)),
    allowNone: true,
    prompt: ghostBridePrompts.ghostBrideKill,
    describe: (_ctx, _seat, targets) => (targets[0] === undefined ? '第三方今晚放弃击杀' : `击杀 ${targets[0]}号`),
    apply: applyKill,
    next: nightAfter('ghost_bride_kill'),
  },
} satisfies WerewolfPhases;

export const ghostBrideSpecial: SpecialDescriptor = {
  key: 'ghostBride',
  prompts: ghostBridePrompts,
  identities: { ghost_bride: ghostBridePrompts.ghostBride, betrayer_wolf: ghostBridePrompts.betrayerWolf },
  phases: ghostBridePhases,
};
