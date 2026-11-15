import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table models alter column temperature drop not null,
    alter column temperature drop default, alter column max_tokens set default 4096`.execute(db);
  await sql`update models set temperature = null, updated_at = now() where temperature = 0.7`.execute(db);
  await sql`update models set max_tokens = 4096, updated_at = now() where max_tokens = 1024`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`update models set temperature = 0.7 where temperature is null`.execute(db);
  await sql`alter table models alter column temperature set default 0.7,
    alter column temperature set not null, alter column max_tokens set default 1024`.execute(db);
}
