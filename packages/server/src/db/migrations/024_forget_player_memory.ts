import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>) {
  await sql`alter table players add column memory_generation integer not null default 0;
    alter table player_memories add column forgotten boolean not null default false`.execute(db);
}

export async function down(db: Kysely<unknown>) {
  await sql`delete from player_memories where forgotten;
    alter table player_memories drop column forgotten;
    alter table players drop column memory_generation`.execute(db);
}
