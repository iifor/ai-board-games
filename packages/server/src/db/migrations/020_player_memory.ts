import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>) {
  await sql`
    create table player_decisions (
      match_id text references matches(id) on delete cascade, request_id text not null,
      owner_id integer not null references players(id) on delete cascade,
      note jsonb not null, primary key (match_id, request_id)
    );
    create index decision_owner_match on player_decisions(owner_id, match_id);
    create table player_memory_reviews (
      match_id text references matches(id) on delete cascade, owner_id integer references players(id) on delete cascade,
      seat integer not null, status text not null default 'queued', attempts integer not null default 0,
      available_at timestamptz not null default now(), primary key (match_id, owner_id)
    );
    create index memory_review_queue on player_memory_reviews(available_at) where status in ('queued','running');
    create table player_memories (
      id serial primary key, owner_id integer not null references players(id) on delete cascade,
      match_id text not null references matches(id) on delete cascade, game_key text not null,
      subject_id integer, subject_name text, phase_id text, action text, content text not null,
      evidence jsonb not null, request_id text, outcome text not null, previous_id integer references player_memories(id) on delete set null,
      created_at timestamptz not null default now()
    );
    create index player_memory_lookup on player_memories(owner_id, game_key, id desc);
    create index player_memory_revision on player_memories(previous_id);
    create table player_memory_uses (
      match_id text not null, request_id text not null, memory_id integer references player_memories(id) on delete cascade,
      round integer not null, phase_id text not null, action text not null,
      foreign key(match_id, request_id) references ai_tasks(match_id, request_id) on delete cascade,
      primary key(memory_id, match_id, request_id)
    );
  `.execute(db);
}

export async function down(db: Kysely<unknown>) {
  await sql`drop table player_memory_uses, player_memories, player_memory_reviews, player_decisions`.execute(db);
}
