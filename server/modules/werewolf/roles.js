const { SkillRegistry } = require('../../../shared/schemas/skillRegistry');

function createWerewolfSkillRegistry() {
  return new SkillRegistry([
    {
      action: 'kill',
      prompt: '夜晚选择击杀目标。',
      async execute({ actor, alive, fallback, topTarget }) {
        const valid = alive.filter((agent) => agent.faction !== 'wolves').map((agent) => agent.id);
        const target = await actor.playerAgent.askVoteTarget('狼人夜晚行动：请选择今晚击杀目标。', valid, fallback);
        return { actorId: actor.id, target, topTarget };
      }
    },
    {
      action: 'inspectFaction',
      prompt: '夜晚查验一名玩家阵营。',
      async execute({ actor, alive, agents }) {
        const valid = alive.filter((agent) => agent.id !== actor.id).map((agent) => agent.id);
        const target = await actor.playerAgent.askVoteTarget('预言家夜晚行动：请选择一名玩家查验阵营。', valid, valid[0]);
        const targetAgent = agents.find((agent) => agent.id === target);
        return { target, result: targetAgent?.faction === 'wolves' ? '狼人' : '好人' };
      }
    },
    {
      action: 'guard',
      prompt: '夜晚守护一名玩家，不能连续两晚守护同一人。',
      async execute({ actor, alive }) {
        const valid = alive.map((agent) => agent.id).filter((id) => id !== actor.lastGuardTarget);
        const target = await actor.playerAgent.askVoteTarget('守卫夜晚行动：请选择今晚守护目标，不能连续两晚守同一人。', valid, valid[0]);
        return { target };
      }
    },
    {
      action: 'save',
      prompt: '女巫解药，可救今晚被狼人袭击的玩家。',
      async execute({ actor, victim, round, modeConfig }) {
        const canSelfSave = round.day === 1 && modeConfig.witch.canSelfSaveNightOne;
        const canSaveVictim = victim && !actor.usedAntidote && (victim.id !== actor.id || canSelfSave);
        if (!canSaveVictim) return { use: false };
        const parsed = await actor.playerAgent.askJson([
          `今晚狼人袭击了 ${victim.id} 号。你还有解药。${victim.id === actor.id ? '首夜允许自救。' : ''}`,
          '是否使用解药救人？只返回 JSON：{"use":true}，不要返回理由。'
        ].join('\n\n'), { maxTokens: 40, fallback: { use: Math.random() > 0.25 } });
        return { use: Boolean(parsed?.use) };
      }
    },
    {
      action: 'poison',
      prompt: '女巫毒药，可毒杀一名玩家。',
      async execute({ actor, alive }) {
        if (actor.usedPoison) return { use: false, target: null };
        const valid = alive.filter((agent) => agent.id !== actor.id).map((agent) => agent.id);
        const parsed = await actor.playerAgent.askJson([
          '你还有毒药。请选择是否使用毒药；不用毒药时 target 返回 null。',
          `可选目标：${valid.join('、')}`,
          '只返回 JSON：{"use":false,"target":null}，不要返回理由。'
        ].join('\n\n'), { maxTokens: 60, fallback: { use: false, target: null } });
        const target = Number(parsed?.target);
        return parsed?.use && valid.includes(target) ? { use: true, target } : { use: false, target: null };
      }
    },
    {
      action: 'shootOnDeath',
      prompt: '死亡或放逐时可以开枪带走一名玩家。',
      async execute({ actor, agents, fallback }) {
        const valid = agents.filter((agent) => agent.alive).map((agent) => agent.id);
        if (!valid.length) return { target: null };
        const target = await actor.playerAgent.askVoteTarget('你是猎人，已出局。请选择是否开枪带走一名玩家。必须选择一名目标。', valid, fallback);
        return { target };
      }
    },
    {
      action: 'surviveExileOnce',
      prompt: '首次被白天放逐时翻牌免死并失去投票权。',
      execute({ actor, modeConfig }) {
        if (!modeConfig.idiot.surviveExileOnce || actor.revealedIdiot) return { survives: false };
        actor.revealedIdiot = true;
        if (modeConfig.idiot.losesVoteAfterReveal) actor.canVote = false;
        return { survives: true };
      }
    },
    { action: 'voteOnly', prompt: '白天投票。', execute: () => ({ ok: true }) },
    { action: 'speakOnly', prompt: '白天发言。', execute: () => ({ ok: true }) }
  ]);
}

module.exports = { createWerewolfSkillRegistry };
