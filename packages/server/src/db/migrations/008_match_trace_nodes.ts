import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.createTable('match_trace_nodes')
    .addColumn('id', 'serial', (c) => c.primaryKey())
    .addColumn('match_id', 'text', (c) => c.notNull().references('matches.id').onDelete('cascade'))
    .addColumn('round', 'integer', (c) => c.notNull())
    .addColumn('phase_id', 'text')
    .addColumn('visit', 'integer', (c) => c.notNull())
    .addColumn('kind', 'text', (c) => c.notNull())
    .addColumn('label', 'text', (c) => c.notNull())
    .addColumn('seat', 'integer')
    .addColumn('seq', 'integer')
    .addColumn('request_ids', 'jsonb', (c) => c.notNull())
    .addColumn('input_request_id', 'text')
    .addColumn('data', 'jsonb')
    .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`statement_timestamp()`))
    .execute();
  await db.schema.createIndex('match_trace_nodes_match_order').on('match_trace_nodes').columns(['match_id', 'id']).execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('match_trace_nodes').execute();
}
