import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table ai_calls add column if not exists trace_settings jsonb`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('ai_calls').dropColumn('trace_settings').execute();
}
