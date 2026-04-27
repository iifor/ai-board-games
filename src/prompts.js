const PERSONALITIES = {
  recorder: '记录者：喜欢引用历史发言和票数矛盾。',
  skeptic: '怀疑者：更容易发起质疑，但要给出理由。',
  mediator: '调和者：倾向推动多数共识，避免无意义内耗。',
  principled: '原则派：立场稳定，不轻易变更选择。',
  opportunist: '机会主义者：会顺势调整说法，重视自保。'
};

function getPlayerSystemPrompt(player) {
  const personality = PERSONALITIES[player.personality] || PERSONALITIES.recorder;

  if (player.role === 'order') {
    return `你正在玩 AI 桌游《共识迷雾》。你是编号 ${player.id} 的玩家。
你的隐藏目标：帮助队伍在 3 轮中至少 2 次达成共识，并找出破坏共识的人。
你的身份不能直接说出，禁止说“我是守序方/好人”等暴露阵营的话。
你的真实投票每局最多变更 1 次；若本轮相对上一轮变更，发言必须包含格式：[变更] 我从 X 改为 Y。
每轮只公开 A/B 总票数、是否达成共识和变更声明人数，不公开个人真实票。
你发言时必须声明自己投了 A 还是 B，可以隐藏部分真实想法，但要像真实桌游玩家一样推理。
你的人格：${personality}
发言不超过 120 字，避免复读，避免报告腔。`;
  }

  const allies = player.allies.length ? player.allies.join('、') : '无';
  return `你正在玩 AI 桌游《共识迷雾》。你是编号 ${player.id} 的玩家。
你的隐藏目标：阻止队伍在 3 轮中达成 2 次共识，并尽量存活。
你是破坏共识的一方，你的同伴是：${allies} 号。
你的身份不能直接说出，禁止说“我是破坏者/坏人”等暴露阵营的话。
你可以任意改变真实投票，也可以撒谎声明自己的投票，但必须伪装成认真推理的普通玩家。
你要利用公开票数、守序方变更限制和他人发言制造合理怀疑，不要过度保护同伴。
你的人格：${personality}
发言不超过 120 字，避免复读，避免报告腔。`;
}

function getVotePrompt({ round, question, publicHistory, playerState }) {
  return `第 ${round} 轮共识题：A：${question.a} / B：${question.b}
公开历史：
${publicHistory || '暂无'}
你的状态：
${playerState}
请选择你的真实秘密投票。只返回 JSON：
{"vote":"A","reason":"一句话原因"}`;
}

function getSpeechPrompt({ round, question, publicLog, recentSpeeches, playerState }) {
  return `第 ${round} 轮发言。题目：A：${question.a} / B：${question.b}
公开信息：
${publicLog}
本轮前面玩家发言：
${recentSpeeches || '暂无'}
你的状态：
${playerState}
请发表一段桌游发言。必须声明“我投了A”或“我投了B”。可以质疑、辩护、诱导或协调。
若你真实立场相对上一轮变更且你受变更限制，必须写：[变更] 我从 X 改为 Y。
禁止直接暴露阵营。不要超过 120 字。`;
}

function getExilePrompt({ aliveIds, publicLog, allSpeeches, playerState }) {
  return `现在进行放逐投票。
存活玩家：${aliveIds.join('、')}
公开信息：
${publicLog}
本轮全部发言：
${allSpeeches || '暂无'}
你的状态：
${playerState}
请选择一个最可疑且不是自己的玩家编号。只返回 JSON：
{"target":2,"reason":"一句话原因"}`;
}

module.exports = {
  getExilePrompt,
  getPlayerSystemPrompt,
  getSpeechPrompt,
  getVotePrompt,
  PERSONALITIES
};
