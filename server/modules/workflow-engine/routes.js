const express = require('express');
const controller = require('./controller');

const router = express.Router();

router.get('/workflow/matches/:matchId/debug', controller.getMatchDebug);
router.post('/workflow/matches/:matchId/tick', controller.wakeMatch);
router.post('/workflow/matches/:matchId/actions/:actionId/submit', controller.submitPendingAction);
router.post('/workflow/ai-tasks/:taskId/retry', controller.retryAiTask);
router.post('/workflow/ai-tasks/:taskId/cancel', controller.cancelAiTask);
router.post('/workflow/ai-tasks/:taskId/manual-complete', controller.manualCompleteAiTask);

module.exports = router;
