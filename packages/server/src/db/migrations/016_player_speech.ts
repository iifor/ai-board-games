import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>) {
  await sql`alter table players
    add column temperature numeric check (temperature between 0 and 2),
    add column max_tokens integer check (max_tokens between 16 and 32000),
    add column speech_max_chars integer check (speech_max_chars between 1 and 500)`.execute(db);
}

export async function down(db: Kysely<unknown>) {
  await sql`alter table players drop column speech_max_chars, drop column max_tokens, drop column temperature`.execute(db);
}
