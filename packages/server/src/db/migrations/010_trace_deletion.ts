import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('matches').addColumn('trace_deleted', 'boolean', (c) => c.notNull().defaultTo(false)).execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('matches').dropColumn('trace_deleted').execute();
}
