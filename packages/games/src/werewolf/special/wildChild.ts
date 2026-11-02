import { definePrompts, type ActDecision, type ComputeOutcome } from '@battle/engine';
import type { WerewolfPhases, WerewolfTriggers } from '../phases/types';
import { hasRole } from '../rules/board';
import type { WerewolfContext } from '../rules/context';
import { nightAfter } from '../rules/order';
import type { WerewolfState } from '../state';
import type { SpecialDescriptor } from './types';

// 野孩子：好人阵营，既不算神职也不算村民（类别 third）。首夜第一个睁眼选择一名榜样（必须选择，双方都不知道对方身份）。
// 榜样出局时野孩子变为狼人：角色改为 wild_child_wolf（狼人阵营、认识狼队），从此与狼队一起夜聊、击杀；
// 只能看到加入之后的狼队频道记录（引擎 Seat.teamSince）。野孩子先于榜样出局则始终是好人。

export const wildChildPrompts = definePrompts({
  wildChild: [
    '你是{{me.label}}，身份是野孩子（好人阵营，既不算神职也不算村民）。',
    '{{#if state.wildChildModel}}你的榜样是 {{state.wildChildModel}}号，你不知道他的身份。{{else}}首夜你要选择一名榜样。{{/if}}',
    '榜样出局时你会变成狼人，从此和狼队一起夜聊、击杀；你若先于榜样出局，则始终是好人。',
  ].join(''),
  wildChildWolf: [
    '你是{{me.label}}，身份是野孩子。你的榜样 {{state.wildChildModel}}号已经出局，你已变成狼人（狼人阵营）。',
    '你的狼队友：{{#each teammates}}{{this.label}}{{#if this.alive}}{{else}}（已出局）{{/if}} {{/each}}。白天发言时你可以在发言后宣布自爆。',
  ].join(''),
  wildChildChoose: '野孩子请睁眼，选择一名玩家作为你的榜样。你不会得知他的身份；他出局时你会变成狼人。',
});

function applyModel(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  const model = decisions.flatMap((decision) => decision.targets)[0];
  return model === undefined ? ctx.state : { ...ctx.state, wildChildModel: model };
}

function becomesWolf(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  const child = ctx.seats.alive().withRole('wild_child').list()[0];
  const model = ctx.state.wildChildModel;
  if (!child || model === null || ctx.seats.get(model).alive) return {};
  return {
    reassign: [{ seat: child.seat, role: 'wild_child_wolf' }],
    log: [
      { kind: 'narration', text: `你的榜样 ${model}号已经出局，你变成了狼人，从今晚起与狼队一起夜聊、击杀。`, channel: `private:${child.seat}` },
      { kind: 'narration', text: `野孩子 ${child.seat}号的榜样已经出局，他变成了狼人，从今晚起加入狼队。`, channel: 'team:werewolf' },
    ],
  };
}

const wildChildPhases = {
  wild_child_choose: {
    kind: 'act',
    title: '野孩子',
    action: '选择榜样',
    enabled: (ctx) => ctx.round === 1 && hasRole(ctx, 'wild_child'),
    actors: (ctx) => ctx.seats.alive().withRole('wild_child'),
    targets: (ctx, seat) => ctx.seats.alive().except(seat),
    prompt: wildChildPrompts.wildChildChoose,
    describe: (_ctx, _seat, targets) => `选择 ${targets[0]}号 作为榜样`,
    apply: applyModel,
    next: nightAfter('wild_child_choose'),
  },
  wild_child_convert: { kind: 'compute', run: becomesWolf, next: 'return' },
} satisfies WerewolfPhases;

const wildChildTriggers: WerewolfTriggers = [
  {
    id: 'wild-child-convert',
    on: 'seat_eliminated',
    when: (ctx, event) => event.kind === 'seat_eliminated' && event.seat === ctx.state.wildChildModel
      && ctx.seats.alive().withRole('wild_child').count() > 0,
    push: 'wild_child_convert',
  },
];

export const wildChildSpecial: SpecialDescriptor = {
  key: 'wildChild',
  prompts: wildChildPrompts,
  identities: { wild_child: wildChildPrompts.wildChild, wild_child_wolf: wildChildPrompts.wildChildWolf },
  phases: wildChildPhases,
  deathTriggers: wildChildTriggers,
};
