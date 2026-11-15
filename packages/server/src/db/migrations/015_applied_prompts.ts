import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>) {
  await db.schema.createTable('applied_prompts')
    .addColumn('game_key', 'text', c => c.notNull())
    .addColumn('variant_key', 'text', c => c.notNull())
    .addColumn('template_name', 'text', c => c.notNull())
    .addColumn('source', 'text', c => c.notNull())
    .addColumn('persona', 'text')
    .addColumn('comparison_id', 'integer', c => c.notNull())
    .addPrimaryKeyConstraint('applied_prompts_pk', ['game_key', 'variant_key', 'template_name']).execute();
}

export async function down(db: Kysely<unknown>) {
  await db.schema.dropTable('applied_prompts').execute();
}
