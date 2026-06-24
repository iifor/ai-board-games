import { Router } from 'express';
import { login, me } from './controller';
import { authMiddleware } from './middleware';

const router = Router();

router.post('/login', login);
router.get('/me', authMiddleware, me);

export default router;
export { authMiddleware };
