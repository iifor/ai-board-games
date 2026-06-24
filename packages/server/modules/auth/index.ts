import crypto from 'crypto';
import type { Database } from '../../db/migrations';
import { hashPasswordSync } from './service';

export { default as authRouter, authMiddleware } from './routes';

/** 将明文密码转为 MD5 hex，与客户端传输格式一致 */
function md5(plain: string): string {
  return crypto.createHash('md5').update(plain).digest('hex');
}

/**
 * Seed default admin user.
 * Call this after database initialization.
 * Synchronous — uses scryptSync internally so seedData() can remain sync.
 */
function seedAdminUser(db: Database): void {
  // 1. 废弃旧账号
  db.prepare("UPDATE admin_users SET enabled = 0 WHERE username = 'admin'").run();

  // 2. 确保 ifor 账号存在且可用
  //    密码先 MD5 再 scrypt，与客户端传输 + verifyPassword 链路一致
  const existing = db.prepare("SELECT id FROM admin_users WHERE username = 'ifor'").get() as { id: number } | undefined;
  const passwordHash = hashPasswordSync(md5('qingfu.wu950111'));

  if (existing) {
    db.prepare("UPDATE admin_users SET password_hash = ?, enabled = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(passwordHash, existing.id);
    console.log('[auth] 管理员账号已更新: ifor');
  } else {
    db.prepare('INSERT INTO admin_users (username, password_hash, display_name) VALUES (?, ?, ?)')
      .run('ifor', passwordHash, '管理员');
    console.log('[auth] 管理员账号已创建: ifor');
  }
}

export { seedAdminUser };
