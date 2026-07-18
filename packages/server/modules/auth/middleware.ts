import { Request, Response, NextFunction } from 'express';
import { verifyToken } from './service';
import * as repo from './repository';

function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ code: 'AUTH_REQUIRED', message: '请先登录' });
    return;
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ code: 'AUTH_REQUIRED', message: '请先登录' });
    return;
  }

  const user = repo.findById(payload.sub);
  if (!user || !user.enabled) {
    res.status(401).json({ code: 'AUTH_REQUIRED', message: '请先登录' });
    return;
  }

  const isAuthSelfServiceRoute = req.baseUrl === '/api/admin/auth'
    && (req.path === '/change-password' || req.path === '/me');
  if (user.must_change_password && !isAuthSelfServiceRoute) {
    res.status(403).json({ code: 'PASSWORD_CHANGE_REQUIRED', message: '请先修改初始密码' });
    return;
  }

  res.locals.user = {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    mustChangePassword: Boolean(user.must_change_password),
  };
  next();
}

export { authMiddleware };
