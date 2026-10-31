import { definePrompts, findResult, type ComputeOutcome } from '@battle/engine';
import type { WerewolfPhases } from '../phases/types';
import { hasRole } from '../rules/board';
import { nightActors } from '../rules/block';
import { isWolf, type WerewolfContext } from '../rules/context';
import { addSeatNote } from '../rules/notes';
import { nightAfter } from '../rules/order';
import type { WerewolfState } from '../state';

// 魅魔：狼队成员（与狼队一起夜聊、击杀，查验为狼人，可以自爆）。首夜在盗贼之后第一个睁眼，必须选择一名好人（非狼人阵营的存活玩家）
// 与自己结为情侣（lovers.ts），两人组成第三方阵营（state.thirdParty），屠城获胜。被选中者私下得知；狼队不知道她选了谁。

export const succubusPrompts = definePrompts({
  succubus: [
    '你是{{me.label}}，身份是魅魔（混在狼队中的第三方）。你的狼队友：{{#each teammates}}{{this.label}}{{#if this.alive}}{{else}}（已出局）{{/if}} {{/each}}。',
    '首夜你第一个睁眼，选择一名好人与你结为情侣：你们组成第三方阵营（一方出局时另一方殉情），需要让其他所有玩家出局才能获胜；你仍与狼队一起夜聊、击杀。白天发言时你可以在发言后宣布自爆。',
  ].join(''),
  succubusLink: '魅魔请睁眼，选择一名好人与你结为情侣，组成第三方阵营。',
});

const SUCCUBUS = 'succubus';

function bond(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  const decision = findResult(ctx.results, 'succubus_link', 'act')?.decisions.find((item) => item.targets.length > 0);
  const partner = decision?.targets[0];
  if (!decision || partner === undefined) return {};
  const succubus = decision.seat;
  const text = `魅魔 ${succubus}号 选择与你结为情侣：你背叛原有阵营，与她组成第三方阵营，需要让其他所有玩家出局才能获胜；一方出局时另一方随之殉情。`;
  const state: WerewolfState = {
    ...ctx.state,
    lovers: [succubus, partner].sort((a, b) => a - b),
    thirdParty: { kind: 'lovers', seats: [succubus, partner].sort((a, b) => a - b), core: [succubus, partner].sort((a, b) => a - b) },
  };
  return {
    state: addSeatNote(addSeatNote(state, succubus, `你与 ${partner}号 结为情侣，组成第三方阵营。`), partner, text),
    log: [{ kind: 'narration', text, channel: `private:${partner}` }],
  };
}

export const succubusPhases = {
  succubus_link: {
    kind: 'act',
    title: '魅魔',
    action: '结为情侣',
    enabled: (ctx) => ctx.round === 1 && hasRole(ctx, SUCCUBUS),
    actors: (ctx) => nightActors(ctx, SUCCUBUS),
    targets: (ctx) => ctx.seats.alive().where((seat) => !isWolf(seat)),
    prompt: succubusPrompts.succubusLink,
    describe: (_ctx, _seat, targets) => `与 ${targets[0]}号 结为情侣`,
    next: nightAfter('succubus_link'),
  },
  succubus_bond: { kind: 'compute', enabled: (ctx) => ctx.round === 1 && hasRole(ctx, SUCCUBUS), run: bond, next: nightAfter('succubus_bond') },
} satisfies WerewolfPhases;
