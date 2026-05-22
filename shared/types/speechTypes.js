/**
 * @typedef {Object} SpeechWordBoundary
 * @property {number} offset Milliseconds from the start of the synthesized audio.
 * @property {number} duration Boundary duration in milliseconds.
 * @property {string} text Text emitted by the speech boundary event.
 */

/**
 * @typedef {Object} SpeechMedia
 * @property {string} text Text synthesized for playback.
 * @property {string} audioUrl Browser-playable audio resource URL.
 * @property {string} audioMimeType Audio content type.
 * @property {SpeechWordBoundary[] | null} wordBoundaries Azure speech boundaries when available.
 */

module.exports = {};
