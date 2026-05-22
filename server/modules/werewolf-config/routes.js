const { Router } = require('express');
const ctrl = require('./controller');
const { validate } = require('../../middlewares/validate');
const { upsertRoleSchema, upsertModeSchema } = require('./validator');

const router = Router();

router.get('/werewolf-roles', ctrl.getRoles);
router.get('/werewolf-roles/:id', ctrl.getRole);
router.post('/werewolf-roles', validate(upsertRoleSchema), ctrl.upsertRole);
router.put('/werewolf-roles/:id', validate(upsertRoleSchema), ctrl.upsertRole);
router.delete('/werewolf-roles/:id', ctrl.deleteRole);

router.get('/werewolf-modes', ctrl.getModes);
router.get('/werewolf-modes/:id', ctrl.getMode);
router.post('/werewolf-modes', validate(upsertModeSchema), ctrl.upsertMode);
router.put('/werewolf-modes/:id', validate(upsertModeSchema), ctrl.upsertMode);
router.delete('/werewolf-modes/:id', ctrl.deleteMode);

module.exports = router;
