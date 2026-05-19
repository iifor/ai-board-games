function buildNightPublicMessage(round = {}) {
  const parts = [];
  const wolfTarget = round.night?.wolfTarget;
  if (wolfTarget) parts.push(`狼人刀口 ${wolfTarget}号。`);

  const deaths = Array.isArray(round.night?.deaths) ? round.night.deaths : [];
  if (!deaths.length) {
    parts.push(`第 ${round.day} 夜是平安夜。`);
  } else {
    parts.push(`第 ${round.day} 夜死亡：${deaths.map((item) => `${item.id}号`).join('、')}。`);
  }
  return parts.join('');
}

function buildSheriffStartMessage(round = {}) {
  const candidates = round.sheriffElection?.candidates || [];
  if (!candidates.length) return '进入上警流程，本局暂无玩家上警。';
  return `进入上警流程，${candidates.map((id) => `${id}号`).join('、')}上警竞选警长。`;
}

function buildSheriffResultMessage(round = {}, modeConfig = {}) {
  if (!round.sheriffId) return '警长竞选结束，本局无人当选警长。';
  const weight = Number(modeConfig.sheriff?.voteWeight || 1.5);
  return `警长竞选结束，${round.sheriffId}号当选警长，放逐投票计为${formatVoteWeight(weight)}票。`;
}

function formatVoteWeight(value) {
  return Number.isInteger(value) ? String(value) : String(value).replace(/0+$/, '').replace(/\.$/, '');
}

module.exports = {
  buildNightPublicMessage,
  buildSheriffStartMessage,
  buildSheriffResultMessage
};
