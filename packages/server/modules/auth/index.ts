import crypto from 'crypto';
import type { Database } from '../../db/migrations';
import type { AdminBootstrapConfig } from './config';
import { hashPasswordSync } from './service';

export { default as authRouter, authMiddleware } from './routes';

/** 将明文密码转为 MD5 hex，与客户端传输格式一致 */
function md5(plain: string): string {
  return crypto.createHash('md5').update(plain).digest('hex');
}

function seedAdminUser(db: Database, admin: AdminBootstrapConfig | null): void {
  if (!admin) {
    console.warn('[auth] 未配置管理员初始化凭据，跳过管理员账号初始化。');
    return;
  }

  db.prepare('UPDATE admin_users SET enabled = 0 WHERE username <> ?').run(admin.username);
  const existing = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(admin.username) as { id: number } | undefined;
  const passwordHash = hashPasswordSync(md5(admin.password));

  if (existing) {
    db.prepare("UPDATE admin_users SET password_hash = ?, enabled = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(passwordHash, existing.id);
    console.log(`[auth] 管理员账号已更新: ${admin.username}`);
  } else {
    db.prepare('INSERT INTO admin_users (username, password_hash, display_name) VALUES (?, ?, ?)')
      .run(admin.username, passwordHash, '管理员');
    console.log(`[auth] 管理员账号已创建: ${admin.username}`);
  }
}

export { seedAdminUser };
