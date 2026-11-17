import { sql, type Kysely } from 'kysely';

// 后台令牌代次：令牌携带签发时的代次，改密或退出登录时递增，已签发的旧令牌随之失效。
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table admin_users add column token_generation integer not null default 1`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`alter table admin_users drop column if exists token_generation`.execute(db);
}
