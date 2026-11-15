import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>) {
  await db.schema.alterTable('matches').addColumn('import_title','text').execute();
  await db.schema.createTable('replay_imports')
    .addColumn('id','uuid', c => c.primaryKey())
    .addColumn('title','text', c => c.notNull())
    .addColumn('revision','integer', c => c.notNull().defaultTo(1))
    .addColumn('document','jsonb', c => c.notNull())
    .addColumn('match_id','text', c => c.unique().references('matches.id').onDelete('cascade'))
    .execute();
}

export async function down(db: Kysely<unknown>) {
  await db.schema.dropTable('replay_imports').execute();
  await db.schema.alterTable('matches').dropColumn('import_title').execute();
}
