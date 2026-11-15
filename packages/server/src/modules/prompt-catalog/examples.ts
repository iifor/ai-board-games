import { advance, buildSeatContext, createSnapshot, DEFAULT_SPEECH_MAX_CHARS, renderTemplate,
  scriptedOutput, speechMaxOf, TemplateError, type AiRequest, type CompiledGame, type EngineSnapshot } from '@battle/engine';
import type { CatalogEntry } from './catalog';

export type Example = {
  label: string;
  rendered: string;
} & ({ request: AiRequest } | { context: Readonly<Record<string, unknown>> });

function start(game: CompiledGame, seed: number, variant = game.spec.defaultVariant) {
  const count = (variant && game.spec.variants?.[variant]?.players || game.spec.players).min;
  const players = Array.from({ length: count }, (_, i) => ({
    playerId: String(i + 1), name: '示例玩家' + (i + 1), avatar: null, persona: '',
  }));
  return createSnapshot(game, { players, seed, ...(variant && { variant }) });
}

// 从真实推进产生的请求取样，不启动 worker 或创建数据库对局。
function* sampleRequests(game: CompiledGame, snapshot: EngineSnapshot, showWolfReply = false) {
  let step = advance(game, snapshot, { kind: 'start' }, false);
  const pending = new Map<string, AiRequest>();
  while (step.status === 'waiting_ai') {
    for (const request of step.aiRequests) {
      pending.set(request.id, request);
      yield { request, snapshot: step.snapshot };
    }
    const id = step.snapshot.pending[0]?.id;
    const next = id && pending.get(id);
    if (!next) throw new Error('样例对局缺少待处理的请求');
    pending.delete(next.id);
    let output = scriptedOutput(game, step.snapshot, next);
    if (showWolfReply && next.taskTemplate?.name === 'wolfChat') {
      const earlier = step.snapshot.log.filter(e => e.kind === 'speech' && e.phaseId === next.phaseId && e.round === step.snapshot.round);
      const first = earlier[0];
      if (earlier.length === 1 && first?.kind === 'speech') {
        const task = '明天开口时帮我核对昨天的票型';
        output = { speech: `${first.seat}号，${task}，可以吗？`, replyRequests: [{ seat: first.seat, task }] };
      }
    }
    step = advance(game, step.snapshot, { kind: 'ai_result', requestId: next.id, output }, false);
  }
}

function turnExamples(game: CompiledGame, key: string): Example[] {
  const examples: Example[] = [];
  const rounds = new Map<number, number>();
  for (const { request, snapshot } of sampleRequests(game, start(game, 41), key === 'wolfChatReply')) {
    const round = snapshot.round;
    const count = rounds.get(round) ?? 0;
    if (request.taskTemplate?.name !== key || count >= (game.spec.key === 'debate' ? 4 : 2)) continue;
    const viewer = snapshot.seats.find(s => s.seat === request.seat)!;
    const label = key === 'wolfChat' ? (count === 0 ? '首位提议' : '队友回应') : game.spec.roles[viewer.role]?.name;
    examples.push({ label: `脚本样例 · 第 ${round} 轮 · ${viewer.seat} 号 ${label}`,
      rendered: request.prompt.instruction, request });
    rounds.set(round, count + 1);
    if (key === 'wolfChatReply') return examples;
    if (examples.length >= (key === 'wolfChat' ? 2 : 4)) return examples;
  }
  return examples;
}

/** 参数示例使用含该角色的真实板子，补入开局发牌无法产生的转职状态。 */
function convertedRoleExample(game: CompiledGame, role: string, variant: string, initialRole: string): Example[] {
  const s = start(game, 41, variant);
  const original = s.seats.find(seat => seat.role === initialRole);
  const next = game.spec.roles[role];
  if (!original || !next) return [];
  const viewer = { ...original, role, team: next.team };
  const fallen = role === 'wild_child_wolf' ? s.seats.find(seat => seat.seat !== viewer.seat)?.seat
    : role === 'wolf_younger_brother_pack' ? s.seats.find(seat => seat.role === 'wolf_elder_brother')?.seat : undefined;
  s.seats = s.seats.map(seat => seat.seat === viewer.seat ? viewer : seat.seat === fallen ? { ...seat, alive: false } : seat);
  if (role === 'wild_child_wolf' && typeof s.state === 'object') s.state = { ...s.state, wildChildModel: fallen };
  const context = buildSeatContext(game, s, viewer, { turn: {}, legalTargets: null });
  return [{ label: `参数示例 · ${viewer.seat} 号转职为${next.name}`, rendered: renderTemplate(next.identity, context), context }];
}

// 这些行动依赖轮次中的私有决定，例如毒药作用的座位和黑商已选择的交易对象。
const actionRoles = new Map([
  ['merchantSkillCheck', 'black_merchant'], ['merchantSkillGun', 'black_merchant'], ['thiefChoose', 'thief'],
  ['spiritWolfAntidote', 'spirit_wolf'], ['witchSave', 'witch'], ['wolfSeedInfect', 'wolf_seed'],
  ['stalkerAssassinate', 'stalker'], ['ghostBrideChat', 'ghost_bride'],
]);

export function builtInExamples(entry: CatalogEntry, registry: ReadonlyMap<string, CompiledGame>): Example[] {
  const { game, template, item } = entry;
  if (!game) return item.key === 'platform'
    ? [...registry.values()].map(g => {
        const context = { title: g.spec.title };
        return { label: g.spec.title, rendered: renderTemplate(template, context), context };
      })
    : [{ label: '固定指令', rendered: template.source, context: {} }];
  if (item.pilot || (game.spec.key === 'debate' && item.key === 'crossfireAnswer') ||
    (game.spec.key === 'werewolf' && ['wolfChat', 'wolfChatReply', 'selfDestructDecision'].includes(item.key))) return turnExamples(game, item.key);
  const conversion = entry.role && convertedRoles.get(entry.role);
  if (game.spec.key === 'werewolf' && entry.role && conversion) {
    const variant = Object.entries(game.spec.variants ?? {}).find(([, v]) => conversion.boardRole in v.assign)?.[0];
    if (variant) return convertedRoleExample(game, entry.role, variant, conversion.seatRole);
  }
  const actorRole = game.spec.key === 'werewolf' ? actionRoles.get(item.key) : undefined;
  if (actorRole) {
    const board = Object.entries(game.spec.variants ?? {}).find(([, v]) => Object.hasOwn(v.assign, actorRole));
    if (board) {
      for (const { request, snapshot } of sampleRequests(game, start(game, 41, board[0]))) {
        if (request.taskTemplate?.name === item.key) return [{
          label: `脚本样例 · ${board[1].name} · 第 ${snapshot.round} 轮 · ${request.seat} 号`, rendered: request.prompt.instruction, request,
        }];
      }
    }
  }
  const phase = entry.phase && game.spec.phases[entry.phase];
  const turn = { maxChars: phase && phase.kind === 'speak' ? speechMaxOf(phase.output) ?? DEFAULT_SPEECH_MAX_CHARS
    : phase && phase.kind === 'judge' ? phase.commentMax ?? 300 : DEFAULT_SPEECH_MAX_CHARS };
  const variants = [...new Set([game.spec.defaultVariant, ...Object.keys(game.spec.variants ?? {})])];
  for (const variant of variants) {
    const assign = (variant ? game.spec.variants?.[variant]?.assign : undefined) ?? game.spec.setup.assign;
    const role = entry.role ?? actorRole;
    if (role && !Object.hasOwn(assign, role)) continue;
    let s = start(game, 41, variant);
    // 盗贼板子会把部分角色抽作底牌，换一次发牌以取得角色本人的视角。
    for (let seed = 1; role && !s.seats.some(seat => seat.role === role) && seed <= 12; seed++) {
      s = start(game, seed, variant);
    }
    s.cursor.phaseId = entry.phase ?? game.spec.start;
    if (entry.phase?.startsWith('postgame')) s.rolesRevealed = true;
    for (const seat of s.seats) {
      if (role && seat.role !== role) continue;
      const target = seat.seat === 1 ? 2 : 1;
      const context = buildSeatContext(game, s, seat, { turn, legalTargets: [target] });
      if (item.variables.includes('state.merchant.target')) {
        const { state } = context;
        if (typeof state === 'object' && state && 'merchant' in state && typeof state.merchant === 'object' && state.merchant) {
          context.state = { ...state, merchant: { ...state.merchant, target } };
        }
      }
      try {
        return [{ label: `参数示例 · ${variant ? game.spec.variants?.[variant]?.name + ' · ' : ''}${seat.seat} 号 ${game.spec.roles[seat.role]?.name}`,
          rendered: renderTemplate(template, context), context }];
      } catch (error) {
        if (!(error instanceof TemplateError)) throw error;
        // 角色专有变量只出现在对应座位的投影里。
      }
    }
  }
  return [];
}

const convertedRoles = new Map([
  ['wild_child_wolf', { boardRole: 'wild_child', seatRole: 'wild_child' }],
  ['betrayer_wolf', { boardRole: 'ghost_bride', seatRole: 'werewolf' }],
  ['infected_wolf', { boardRole: 'wolf_seed', seatRole: 'villager' }],
  ['wolf_younger_brother_pack', { boardRole: 'wolf_younger_brother', seatRole: 'wolf_younger_brother' }],
]);
