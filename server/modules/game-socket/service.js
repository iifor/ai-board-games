// Re-export socket attachment and session management from existing file
const { attachGameSocket, createSession, runSession, replayGameSession } = require('../../gameSocket');
module.exports = { attachGameSocket, createSession, runSession, replayGameSession };
