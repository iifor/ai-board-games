const { getDebateRoleName } = require('./prompts');
const { cleanText } = require('./utils');

function createPhase(source) {
  return { ...source, speeches: [], votes: [], summary: '', stageSummary: '' };
}

function pushSpeech(phase, agent, text, kind = 'speech', targetId = null) {
  const item = {
    phaseId: phase.id,
    kind,
    playerId: agent.id,
    side: agent.side,
    debateRole: agent.debateRole,
    speakerLabel: getDebateRoleName(agent),
    text,
    targetId
  };
  phase.speeches.push(item);
  agent.speeches.push(item);
  return item;
}

async function emitSpeech(ctx, phase, agent, result, kind, targetId = null) {
  const text = typeof result === 'string' ? result : result.content;
  const thinking = typeof result === 'string' ? '' : (result.thinking || '');
  if (thinking) await ctx.emit({ type: 'thinking', playerId: agent.id, thinking });
  const speech = pushSpeech(phase, agent, text, kind, targetId);
  if (thinking) speech.thinking = thinking;
  await ctx.emit({ type: 'speech', phase, speech, game: ctx.serialize() });
  return speech;
}

function summarizeDebatePhase(phase) {
  const texts = (phase.speeches || [])
    .map((speech) => `${speech.speakerLabel || '发言'}：${cleanText(speech.text)}`)
    .filter(Boolean);
  if (!texts.length) return cleanText(phase.summary).slice(0, 120);
  return texts.join('；').slice(0, 260);
}

module.exports = { createPhase, pushSpeech, emitSpeech, summarizeDebatePhase };
