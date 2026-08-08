import { getDbExecutor } from '../../db';
import type { AdminUser } from './types';

async function findByUsername(username: string): Promise<AdminUser | undefined> {
  return (await getDbExecutor().queryOne<AdminUser>('SELECT * FROM admin_users WHERE username = $1', [username])) || undefined;
}

async function findById(id: number): Promise<AdminUser | undefined> {
  return (await getDbExecutor().queryOne<AdminUser>('SELECT * FROM admin_users WHERE id = $1', [id])) || undefined;
}

async function create(username: string, passwordHash: string, displayName: string, mustChangePassword = false): Promise<number> {
  const row = await getDbExecutor().queryOne<{ id: number }>(
    'INSERT INTO admin_users (username, password_hash, display_name, must_change_password) VALUES ($1, $2, $3, $4) RETURNING id',
    [username, passwordHash, displayName, mustChangePassword ? 1 : 0],
  );
  if (!row) throw new Error('Failed to create admin user');
  return row.id;
}

async function updatePassword(id: number, newPasswordHash: string): Promise<void> {
  await getDbExecutor().execute(
    'UPDATE admin_users SET password_hash = $1, must_change_password = 0, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
    [newPasswordHash, id],
  );
}

async function countAll(): Promise<number> {
  const row = await getDbExecutor().queryOne<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM admin_users');
  return row?.cnt || 0;
}

export { findByUsername, findById, create, updatePassword, countAll };
