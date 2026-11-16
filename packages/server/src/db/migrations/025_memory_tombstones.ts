import { sql, type Kysely } from 'kysely';

// 删除对局时，这局产生且修正过其他对局记忆的那些记忆改为遗忘墓碑保留（不再关联对局），被修正的旧记忆继续隐藏。
// 只有已遗忘的墓碑可以没有来源对局。
export async function up(db: Kysely<unknown>) {
  await sql`alter table player_memories alter column match_id drop not null;
    alter table player_memories add constraint player_memory_source check (forgotten or match_id is not null)`.execute(db);
}

export async function down(db: Kysely<unknown>) {
  await sql`delete from player_memories where match_id is null;
    alter table player_memories drop constraint player_memory_source;
    alter table player_memories alter column match_id set not null`.execute(db);
}
