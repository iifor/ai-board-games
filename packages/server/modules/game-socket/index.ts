import { attachGameSocket, runSession } from './service';
import { createSession } from './session';
import { createPreparedSender } from './sender';
import { replayGameSession } from './replay';
import { SPEECH_ACK_TIMEOUT_MS, GAME_TYPES } from './constants';

// routes/gameRoutes is TS — import default
import router from '../../routes/gameRoutes';

export {
  router,
  attachGameSocket,
  runSession,
  createSession,
  createPreparedSender,
  replayGameSession,
  SPEECH_ACK_TIMEOUT_MS,
  GAME_TYPES,
};
