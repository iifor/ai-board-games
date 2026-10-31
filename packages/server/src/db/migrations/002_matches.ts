import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.createTable('matches')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('game_key', 'text', (col) => col.notNull())
    .addColumn('variant_key', 'text')
    .addColumn('spec_version', 'integer', (col) => col.notNull())
    .addColumn('spec_hash', 'text', (col) => col.notNull())
    .addColumn('seed', 'bigint', (col) => col.notNull())
    .addColumn('params', 'jsonb', (col) => col.notNull())
    .addColumn('status', 'text', (col) => col.notNull())
    /** 调试局：可断点、单步、跳过 */
    .addColumn('debug', 'boolean', (col) => col.notNull().defaultTo(false))
    /** 脚本化：不调用真实模型与云端语音 */
    .addColumn('scripted', 'boolean', (col) => col.notNull().defaultTo(false))
    /** ack：按观众确认节奏推进；free：不等待观众（调试、离线跑局） */
    .addColumn('pacing', 'text', (col) => col.notNull().defaultTo('ack'))
    .addColumn('snapshot', 'jsonb', (col) => col.notNull())
    .addColumn('version', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('last_seq', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('acked_seq', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('result', 'jsonb')
    .addColumn('error', 'text')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('completed_at', 'timestamptz')
    .execute();
  await db.schema.createIndex('matches_status_idx').on('matches').columns(['status', 'created_at']).execute();

  await db.schema.createTable('match_seats')
    .addColumn('match_id', 'text', (col) => col.notNull().references('matches.id').onDelete('cascade'))
    .addColumn('seat', 'integer', (col) => col.notNull())
    .addColumn('player_id', 'integer', (col) => col.references('players.id').onDelete('set null'))
    .addColumn('player_name', 'text', (col) => col.notNull())
    .addColumn('model_id', 'integer', (col) => col.references('models.id').onDelete('set null'))
    .addColumn('voice_id', 'integer', (col) => col.references('voices.id').onDelete('set null'))
    .addPrimaryKeyConstraint('match_seats_pk', ['match_id', 'seat'])
    .execute();

  await db.schema.createTable('ai_tasks')
    .addColumn('match_id', 'text', (col) => col.notNull().references('matches.id').onDelete('cascade'))
    .addColumn('request_id', 'text', (col) => col.notNull())
    .addColumn('seat', 'integer', (col) => col.notNull())
    .addColumn('request', 'jsonb', (col) => col.notNull())
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('queued'))
    .addColumn('claimed_until', 'timestamptz')
    .addColumn('output', 'jsonb')
    .addColumn('error', 'text')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('ai_tasks_pk', ['match_id', 'request_id'])
    .execute();
  await db.schema.createIndex('ai_tasks_status_idx').on('ai_tasks').columns(['status', 'created_at']).execute();

  await db.schema.createTable('match_stage_events')
    .addColumn('match_id', 'text', (col) => col.notNull().references('matches.id').onDelete('cascade'))
    .addColumn('seq', 'integer', (col) => col.notNull())
    .addColumn('event', 'jsonb', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('match_stage_events_pk', ['match_id', 'seq'])
    .execute();

  await db.schema.createTable('ai_calls')
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('match_id', 'text', (col) => col.notNull().references('matches.id').onDelete('cascade'))
    .addColumn('request_id', 'text', (col) => col.notNull())
    .addColumn('seat', 'integer', (col) => col.notNull())
    .addColumn('model_id', 'integer', (col) => col.references('models.id').onDelete('set null'))
    .addColumn('model_name', 'text', (col) => col.notNull())
    .addColumn('prompt', 'jsonb', (col) => col.notNull())
    .addColumn('raw_response', 'text')
    .addColumn('output', 'jsonb')
    .addColumn('error', 'text')
    .addColumn('latency_ms', 'integer', (col) => col.notNull())
    .addColumn('usage', 'jsonb')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.createIndex('ai_calls_match_idx').on('ai_calls').columns(['match_id', 'id']).execute();

  await db.schema.createTable('media_assets')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('provider', 'text', (col) => col.notNull())
    .addColumn('voice_name', 'text', (col) => col.notNull())
    .addColumn('mime', 'text', (col) => col.notNull())
    .addColumn('data', 'bytea', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of ['media_assets', 'ai_calls', 'match_stage_events', 'ai_tasks', 'match_seats', 'matches']) {
    await db.schema.dropTable(table).ifExists().execute();
  }
}
