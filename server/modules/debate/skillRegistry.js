const { AgentSkillRegistry } = require('../agent-core');
const { PHASE_LIMITS } = require('./constants');
const { getDebateRoleName } = require('./prompts');

function createDebateSkillRegistry() {
  return new AgentSkillRegistry(createDebateSkills());
}

function createDebateSkills() {
  return [
    textSkill('strategize', '请给本方队友做战术部署。', (actor) => `${actor.sideLabel}先稳住核心论点，抓住对方定义漏洞，队友分工补证据和反问。`),
    textSkill('opening_argue', '请完成本方立论陈词。', (actor) => `${actor.sideLabel}认为本方立场更能兼顾现实约束与长期价值，核心标准应当先被清晰定义。`),
    textSkill('free_speech', '请进行自由辩论发言，回应最近争点并推进本方论证。', (actor) => `${actor.sideLabel}补充一点：对方刚才回避了评判标准，我方才是在处理真实场景。`),
    textSkill('closing_summary', '请以四辩身份完成本方总结陈词。', (actor) => `${actor.sideLabel}总结：我方完成了定义、风险和价值三层证明，对方关键反驳没有击穿核心标准。`),
    textSkill('postgame_speech', '请发表赛后感言：可以回应本场胜负、点评关键争点、感谢队友或回应对手。不要再投票。', (actor) => `${actor.sideLabel}赛后想说，本场最关键的是双方都把核心标准讲清楚了；无论结果如何，这场交锋很过瘾。`),
    {
      action: 'crossfire_question',
      prompt: '向对方提出尖锐问题。',
      execute: ({ actor, phase, target }) => askDebateText(actor, { ...phase, limit: PHASE_LIMITS.crossfire_question }, `请向${getDebateRoleName(target)}提出一个尖锐问题。`, '请问对方如何解释本方标准下的关键风险？', 'crossfire_question')
    },
    {
      action: 'crossfire_answer',
      prompt: '回应对方问题并反击。',
      execute: ({ actor, phase, target }) => askDebateText(actor, phase, `请回应${getDebateRoleName(target)}刚才的问题，并反击一句。`, '这个问题忽略了前提差异，我方标准更能处理边界情况。', 'crossfire_answer')
    },
    {
      action: 'judge_review',
      prompt: '点评双方表现并给出胜负倾向。',
      async execute({ actor, state }) {
        const parsed = await actor.playerAgent.askJson([
          '请点评双方表现，并给出胜负倾向。',
          '公开赛况已通过上文增量同步。',
          `只返回 JSON：{"winner":"pro","text":"建议${PHASE_LIMITS.judges}字以内点评（弱约束，超出也正常输出）"}，winner 只能是 pro/con/draw。`
        ].join('\n\n'), {
          maxTokens: Math.ceil(PHASE_LIMITS.judges * 2.5),
          fallback: { winner: 'draw', text: '双方都有亮点，正方结构完整，反方反击积极，胜负取决于评判标准。' },
          skillId: 'judge_review',
          phase: state.phases.at(-1)?.id,
          severity: 'error'
        });
        return {
          winner: ['pro', 'con', 'draw'].includes(parsed?.winner) ? parsed.winner : 'draw',
          text: String(parsed?.text || '双方都有亮点，正方结构完整，反方反击积极，胜负取决于评判标准。').trim()
        };
      }
    },
    {
      action: 'vote_mvp',
      prompt: '评选最佳辩手。',
      async execute({ actor, contestants, fallbackAudit }) {
        const fallback = contestants[Math.floor(Math.random() * contestants.length)];
        const parsed = await actor.playerAgent.askJson([
          '请从正反方 8 位选手中评选最佳辩手。',
          `可选对象：${contestants.map((agent) => `${agent.id}号${agent.nickname}`).join('、')}`,
          '公开赛况已通过上文增量同步。',
          '只返回 JSON：{"target":2}，不要返回理由。'
        ].join('\n\n'), {
          maxTokens: 80,
          fallback: { target: fallback.id },
          skillId: 'vote_mvp',
          phase: 'mvp',
          severity: 'error'
        });
        const target = Number(parsed?.target);
        if (contestants.some((agent) => agent.id === target)) {
          return { voterId: actor.id, target };
        }
        fallbackAudit?.record({
          gameType: 'debate',
          phase: 'mvp',
          skillId: 'vote_mvp',
          actorId: actor.id,
          reason: 'invalid-target',
          fallbackValue: { target: fallback.id },
          severity: 'error'
        });
        return { voterId: actor.id, target: fallback.id };
      }
    }
  ];
}

function textSkill(action, instruction, fallbackFactory) {
  return {
    action,
    prompt: instruction,
    execute: ({ actor, phase }) => askDebateText(actor, phase, instruction, fallbackFactory(actor), action)
  };
}

async function askDebateText(actor, phase, instruction, fallback, skillId) {
  const limit = phase.limit || 200;
  const prompt = [
    `当前环节：${phase.name}`,
    `建议字数：${limit}字以内（弱约束，超出也正常输出）`,
    '公开赛况：已通过上文增量同步；如果没有同步内容，则比赛刚开始。',
    instruction
  ].join('\n\n');
  const options = {
    maxTokens: Math.ceil(limit * 2.5),
    limit,
    fallback,
    skillId,
    phase: phase.id,
    severity: 'warning'
  };
  if (actor.thinkingEnabled && actor.playerAgent.thinkingEnabled) {
    return actor.playerAgent.askTextWithThinking(prompt, options);
  }
  return actor.playerAgent.askText(prompt, options);
}

module.exports = { createDebateSkillRegistry, createDebateSkills };
