const { Router } = require('express');
const ctrl = require('./controller');

const router = Router();
router.get('/settings', ctrl.getSettings);
router.put('/settings/default-host', ctrl.setDefaultHost);

module.exports = router;
