import { Hono } from 'hono';
import { requireAccess } from '../../middlewares/auth';
import type { AppEnv } from '../../types';
import { createAdminAccessController, createPublicAccessController, type AccessControllerOptions } from './controller';
import type { AccessCodeService } from './service';

/** 后台：身份码的增删改与重新生成（外层挂管理员鉴权） */
export function adminAccessCodeRoutes(service: AccessCodeService) {
  const controller = createAdminAccessController(service);
  return new Hono<AppEnv>()
    .get('/', controller.list)
    .post('/', controller.create)
    .put('/:id', controller.update)
    .post('/:id/regenerate', controller.regenerate)
    .delete('/:id', controller.remove);
}

/** C 端：输入身份码换取凭证、查询凭证对应的持有人与剩余局数 */
export function publicAccessRoutes(service: AccessCodeService, options: AccessControllerOptions) {
  const controller = createPublicAccessController(service, options);
  return new Hono<AppEnv>()
    .post('/session', controller.session)
    .get('/me', requireAccess(service), controller.me);
}
