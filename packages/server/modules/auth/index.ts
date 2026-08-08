import crypto from 'crypto';
import type { AdminBootstrapConfig } from './config';
import * as repository from './repository';
import { hashPasswordSync } from './service';

export { default as authRouter, authMiddleware } from './routes';

function md5(plain: string): string {
  return crypto.createHash('md5').update(plain).digest('hex');
}

async function seedAdminUser(admin: AdminBootstrapConfig | null): Promise<void> {
  if (await repository.countAll() > 0) {
    console.log('[auth] 已存在管理员账号，跳过初始化。');
    return;
  }
  if (!admin) {
    console.warn('[auth] 未配置管理员初始化凭据，跳过管理员账号初始化。');
    return;
  }
  const passwordHash = hashPasswordSync(md5(admin.password));
  await repository.create(admin.username, passwordHash, '管理员', true);
  console.log(`[auth] 管理员账号已创建: ${admin.username}`);
}

export { seedAdminUser };
