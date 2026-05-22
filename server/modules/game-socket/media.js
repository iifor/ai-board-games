const { getVoicePackage } = require('../voices');
const { prepareVoiceAudio } = require('../tts');
const { splitPlayableTextSegments, stripSpeechParentheses } = require('../../services/text/playableText');
const { getNarration } = require('./narration');

function prepareOutgoingEvent(event) {
  return prepareEventMedia(withNarration(cloneEvent(event)));
}

function collectPreparedAudioResources(event, target) {
  if (event?.audioUrl) target.add(event.audioUrl);
  (event?.audioSegments || []).forEach((segment) => {
    if (segment?.audioUrl) target.add(segment.audioUrl);
  });
}

function cloneEvent(event) {
  return JSON.parse(JSON.stringify(event || {}));
}

function withNarration(event) {
  return { ...event, narration: getNarration(event) };
}

async function prepareEventMedia(event) {
  const text = getPlayableEventText(event);
  const subtitle = text ? {
    text,
    playerId: event.speech?.playerId || event.testimony?.playerId || null,
    speakerRole: getEventSpeakerRole(event, text),
    speakerLabel: getEventSpeakerLabel(event, text)
  } : null;
  const result = subtitle ? { ...withPlayableDetails(event, text), subtitle } : withPlayableDetails(event, text);
  if (!text) return result;

  const voice = resolveEventVoice(event);
  if (!voice || !voice.enabled || String(voice.provider || '').toLowerCase() !== 'azure') return result;

  try {
    if (shouldPrepareSegmentedAudio(event)) {
      const segments = splitPlayableTextSegments(text);
      const preparedSegments = await Promise.all(segments.map(async (segment, index) => {
        const speechText = segment.speechText || stripSpeechParentheses(segment.displayText);
        if (!speechText) return null;
        const saved = await prepareVoiceAudio(voice, speechText, event.game?.id);
        return saved ? { index, text: segment.displayText, speechText, audioUrl: saved.audioUrl, audioMimeType: saved.audioMimeType, audioCached: saved.audioCached, wordBoundaries: saved.wordBoundaries || null } : null;
      }));
      return { ...result, audioSegments: preparedSegments.filter(Boolean) };
    }
    const speechText = stripSpeechParentheses(text);
    if (!speechText) return result;
    const saved = await prepareVoiceAudio(voice, speechText, event.game?.id);
    if (!saved) return result;
    return { ...result, audioUrl: saved.audioUrl, audioMimeType: saved.audioMimeType, audioCached: saved.audioCached, wordBoundaries: saved.wordBoundaries || null };
  } catch (error) {
    return { ...result, mediaError: error.message };
  }
}

function shouldPrepareSegmentedAudio(event) {
  if (!event.game || !['debate', 'werewolf'].includes(event.game.type)) return false;
  return Boolean(event.speech?.playerId || event.testimony?.playerId);
}

function getEventSpeakerRole(event, text = '') {
  if (event.speech?.playerId || event.testimony?.playerId) return 'player';
  if (event.type === 'done') return 'system';
  if (/^游戏开始/.test(String(text || event.message || event.narration || '').trim())) return 'system';
  if (/^游戏结束/.test(String(text || event.message || event.narration || '').trim())) return 'system';
  return 'host';
}

function getEventSpeakerLabel(event, text = '') {
  const role = getEventSpeakerRole(event, text);
  if (role === 'system') return '系统播报';
  if (role === 'host') return '主持人';
  return '';
}

function getPlayableEventText(event) {
  if (event.speech?.text) return String(event.speech.text).trim();
  if (event.testimony?.text) return String(event.testimony.text).trim();
  if (event.testimony?.testimony) return String(event.testimony.testimony).trim();
  return String(event.narration || event.message || '').trim();
}

function withPlayableDetails(event, fullText) {
  if (event.speech) {
    return {
      ...event,
      speech: {
        ...event.speech,
        fullText: event.speech.fullText || fullText || event.speech.text || '',
        thinking: event.speech.thinking || event.speech.reasoning || event.speech.thought || ''
      }
    };
  }
  if (event.testimony) {
    return {
      ...event,
      testimony: {
        ...event.testimony,
        fullText: event.testimony.fullText || fullText || event.testimony.text || event.testimony.testimony || '',
        thinking: event.testimony.thinking || event.testimony.reasoning || event.testimony.thought || ''
      }
    };
  }
  return event;
}

function resolveEventVoice(event) {
  const playerId = event.speech?.playerId || event.testimony?.playerId;
  if (playerId) {
    const player = event.game?.players?.find((item) => Number(item.id) === Number(playerId));
    if (player?.voicePackageId) return getVoicePackage(player.voicePackageId);
  }
  if (event.game?.host?.voicePackageId) return getVoicePackage(event.game.host.voicePackageId);
  return null;
}

module.exports = {
  prepareOutgoingEvent,
  collectPreparedAudioResources,
  cloneEvent,
  withNarration,
  prepareEventMedia,
  shouldPrepareSegmentedAudio,
  getEventSpeakerRole,
  getEventSpeakerLabel,
  getPlayableEventText,
  withPlayableDetails,
  resolveEventVoice
};
