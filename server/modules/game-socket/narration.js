// Narration helpers extracted from gameSocket.js
// Re-exporting from existing for now - full extraction deferred
const { getNarration, getWerewolfNarration, getDebateNarration } = require('../../gameSocket');
module.exports = { getNarration, getWerewolfNarration, getDebateNarration };
