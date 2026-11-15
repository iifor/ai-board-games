import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>) {
  await db.schema.alterTable('media_assets').addColumn('captions', 'jsonb').execute();
}

export async function down(db: Kysely<unknown>) {
  await db.schema.alterTable('media_assets').dropColumn('captions').execute();
}
