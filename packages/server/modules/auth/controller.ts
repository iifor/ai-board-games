import { Request, Response } from 'express';
import * as repo from './repository';
import { LoginRateLimiter } from './loginRateLimiter';
import { hashPassword, verifyPassword, signToken } from './service';
import type { LoginRequest, LoginResponse } from './types';

const loginRateLimiter = new LoginRateLimiter();

async function login(req: Request, res: Response): Promise<void> {
  const { username, password } = req.body as LoginRequest;

  if (!username || !password) {
    res.status(400).json({ code: 400, message: '用户名和密码不能为空' });
    return;
  }

  const limit = loginRateLimiter.registerAttempt(req.ip, username);
  if (!limit.allowed) {
    res.status(429).json({
      code: 429,
      message: '登录尝试过于频繁，请稍后再试',
      data: { retryAfterSeconds: limit.retryAfterSeconds },
    });
    return;
  }

  const user = repo.findByUsername(username);
  if (!user || !user.enabled) {
    res.status(401).json({ code: 401, message: '用户名或密码错误' });
    return;
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    res.status(401).json({ code: 401, message: '用户名或密码错误' });
    return;
  }

  const token = signToken({ sub: user.id, username: user.username });
  const data: LoginResponse = {
    token,
    mustChangePassword: Boolean(user.must_change_password),
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
    },
  };
  loginRateLimiter.clear(req.ip, username);
  res.json({ code: 0, message: '登录成功', data });
}

async function changePassword(req: Request, res: Response): Promise<void> {
  const user = res.locals.user as { id: number; username: string; displayName: string } | undefined;
  const { password } = req.body as { password?: unknown };

  if (!user) {
    res.status(401).json({ code: 'AUTH_REQUIRED', message: '请先登录' });
    return;
  }
  if (typeof password !== 'string' || !/^[a-f0-9]{32}$/i.test(password)) {
    res.status(400).json({ code: 400, message: '新密码格式无效' });
    return;
  }

  const current = repo.findById(user.id);
  if (!current || !current.enabled) {
    res.status(401).json({ code: 'AUTH_REQUIRED', message: '请先登录' });
    return;
  }

  repo.updatePassword(current.id, await hashPassword(password));
  const token = signToken({ sub: current.id, username: current.username });
  res.json({
    code: 0,
    message: '密码修改成功',
    data: {
      token,
      mustChangePassword: false,
      user: { id: current.id, username: current.username, displayName: current.display_name },
    },
  });
}

function me(_req: Request, res: Response): void {
  const user = res.locals.user;
  if (!user) {
    res.status(401).json({ code: 'AUTH_REQUIRED', message: '请先登录' });
    return;
  }
  res.json({ code: 0, message: 'ok', data: user });
}

export { login, me, changePassword };
