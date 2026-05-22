// Media preparation helpers extracted from gameSocket.js
// Re-exporting from existing for now - full extraction deferred
const {
  prepareOutgoingEvent, prepareEventMedia, withPlayableDetails,
  resolveEventVoice, shouldPrepareSegmentedAudio, createPreparedSender
} = require('../../gameSocket');
module.exports = {
  prepareOutgoingEvent, prepareEventMedia, withPlayableDetails,
  resolveEventVoice, shouldPrepareSegmentedAudio, createPreparedSender
};
