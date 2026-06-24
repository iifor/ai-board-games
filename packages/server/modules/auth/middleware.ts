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

  res.locals.user = {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
  };
  next();
}

export { authMiddleware };
