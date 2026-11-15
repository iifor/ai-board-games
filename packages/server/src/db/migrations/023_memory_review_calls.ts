import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>) {
  await sql`create table memory_review_calls (
    id serial primary key, match_id text not null, owner_id integer not null, seat integer not null,
    job_attempt integer not null, model_id integer not null, provider_id integer not null, model text not null,
    is_backup boolean not null, status text not null default 'started', detail text,
    latency_ms integer, prompt_tokens integer, completion_tokens integer, created_at timestamptz not null default now(),
    foreign key (match_id, owner_id) references player_memory_reviews(match_id, owner_id) on delete cascade
  );
  create index memory_review_calls_owner on memory_review_calls(owner_id, id desc)`.execute(db);
}

export async function down(db: Kysely<unknown>) {
  await sql`drop table memory_review_calls`.execute(db);
}
