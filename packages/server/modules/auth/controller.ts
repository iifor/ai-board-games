import { Request, Response } from 'express';
import * as repo from './repository';
import { verifyPassword, signToken } from './service';
import type { LoginRequest, LoginResponse } from './types';

async function login(req: Request, res: Response): Promise<void> {
  const { username, password } = req.body as LoginRequest;

  if (!username || !password) {
    res.status(400).json({ code: 400, message: '用户名和密码不能为空' });
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
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
    },
  };
  res.json({ code: 0, message: '登录成功', data });
}

function me(_req: Request, res: Response): void {
  const user = res.locals.user;
  if (!user) {
    res.status(401).json({ code: 'AUTH_REQUIRED', message: '请先登录' });
    return;
  }
  res.json({ code: 0, message: 'ok', data: user });
}

export { login, me };
