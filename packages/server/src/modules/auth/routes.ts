import { Hono } from 'hono';
import { requireAdmin } from '../../middlewares/auth';
import type { AppEnv } from '../../types';
import { createAuthController, type AuthControllerOptions } from './controller';
import type { AuthService } from './service';

export function authRoutes(service: AuthService, options: AuthControllerOptions) {
  const controller = createAuthController(service, options);
  const passwordStage = requireAdmin(service, { allowPasswordChange: true });
  return new Hono<AppEnv>()
    .post('/login', controller.login)
    .post('/password', passwordStage, controller.changePassword)
    .get('/me', passwordStage, controller.me);
}
