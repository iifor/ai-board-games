import { Router } from 'express';
import { changePassword, login, me } from './controller';
import { authMiddleware } from './middleware';

const router = Router();

router.post('/login', login);
router.post('/change-password', authMiddleware, changePassword);
router.get('/me', authMiddleware, me);

export default router;
export { authMiddleware };
