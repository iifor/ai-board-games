const express = require('express');
const controller = require('./controller');

const router = express.Router();

router.get('/workflow/matches/:matchId/debug', controller.getMatchDebug);
router.post('/workflow/matches/:matchId/tick', controller.wakeMatch);

module.exports = router;
