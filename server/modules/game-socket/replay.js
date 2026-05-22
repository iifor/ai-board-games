// Replay event builders extracted from gameSocket.js
// Re-exporting from existing for now - full extraction deferred
const {
  buildReplayPlaybackEvents, buildWerewolfReplayPlaybackEvents,
  appendWerewolfSheriffPlaybackEvents, normalizeReplayGame
} = require('../../gameSocket');
module.exports = {
  buildReplayPlaybackEvents, buildWerewolfReplayPlaybackEvents,
  appendWerewolfSheriffPlaybackEvents, normalizeReplayGame
};
