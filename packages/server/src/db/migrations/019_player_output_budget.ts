import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>) {
  await sql`alter table models alter column max_tokens set default 8192`.execute(db);
  await sql`update models set max_tokens = 8192, updated_at = now() where max_tokens = 4096`.execute(db);
  // NULL 随人设采用新默认预算。手填预算只在升级时翻倍，遵守后台支持的最大值。
  await sql`update players set max_tokens = least(max_tokens * 2, 32000), updated_at = now()
    where max_tokens is not null and max_tokens < 32000`.execute(db);
}
