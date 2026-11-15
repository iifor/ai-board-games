import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>) {
  await db.schema.createTable('announcement_templates')
    .addColumn('game_key', 'text', c => c.notNull())
    .addColumn('key', 'text', c => c.notNull())
    .addColumn('custom_text', 'text')
    .addColumn('revision', 'integer', c => c.notNull())
    .addPrimaryKeyConstraint('announcement_templates_pk', ['game_key', 'key']).execute();
}

export async function down(db: Kysely<unknown>) {
  await db.schema.dropTable('announcement_templates').execute();
}
