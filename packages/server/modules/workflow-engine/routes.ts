import { Router } from 'express';
import * as controller from './controller';

const router = Router();

router.get('/workflow/matches/:matchId/debug', controller.getMatchDebug);
router.post('/workflow/matches/:matchId/tick', controller.wakeMatch);
router.post('/workflow/matches/:matchId/debug-control', controller.controlUndercoverDebug);
router.post('/workflow/matches/:matchId/actions/:actionId/submit', controller.submitPendingAction);
router.post('/workflow/ai-tasks/:taskId/retry', controller.retryAiTask);
router.post('/workflow/ai-tasks/:taskId/cancel', controller.cancelAiTask);
router.post('/workflow/ai-tasks/:taskId/manual-complete', controller.manualCompleteAiTask);
router.post('/workflow/matches/:matchId/interrupts', controller.createInterrupt);
router.post('/workflow/interrupts/:interruptId/resolve', controller.resolveInterrupt);

export default router;
