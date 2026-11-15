import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>) {
  await db.schema.createTable('prompt_comparisons')
    .addColumn('id', 'serial', c => c.primaryKey())
    .addColumn('match_id', 'text', c => c.notNull())
    .addColumn('request_id', 'text', c => c.notNull())
    .addColumn('result', 'jsonb', c => c.notNull())
    .addColumn('created_at', 'timestamptz', c => c.notNull().defaultTo(sql`now()`))
    .addForeignKeyConstraint('comparison_task_fk', ['match_id', 'request_id'], 'ai_tasks', ['match_id', 'request_id'], c => c.onDelete('cascade'))
    .execute();
  await db.schema.createIndex('comparison_request_idx').on('prompt_comparisons').columns(['match_id', 'request_id', 'id']).execute();
}

export async function down(db: Kysely<unknown>) {
  await db.schema.dropTable('prompt_comparisons').execute();
}
