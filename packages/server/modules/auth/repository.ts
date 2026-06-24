import { getDb } from '../../db';
import type { AdminUser } from './types';

function findByUsername(username: string): AdminUser | undefined {
  return getDb().prepare('SELECT * FROM admin_users WHERE username = ?').get(username) as AdminUser | undefined;
}

function findById(id: number): AdminUser | undefined {
  return getDb().prepare('SELECT * FROM admin_users WHERE id = ?').get(id) as AdminUser | undefined;
}

function create(username: string, passwordHash: string, displayName: string): number {
  const result = getDb().prepare(
    'INSERT INTO admin_users (username, password_hash, display_name) VALUES (?, ?, ?)'
  ).run(username, passwordHash, displayName);
  return Number(result.lastInsertRowid);
}

function updatePassword(id: number, newPasswordHash: string): void {
  getDb().prepare(
    'UPDATE admin_users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(newPasswordHash, id);
}

function countAll(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS cnt FROM admin_users').get() as { cnt: number };
  return row.cnt;
}

export { findByUsername, findById, create, updatePassword, countAll };
