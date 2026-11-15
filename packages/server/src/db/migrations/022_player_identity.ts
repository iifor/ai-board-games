import { playerPortraitKey } from '@battle/shared';
import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>) {
  await db.schema.alterTable('players').alterColumn('name', col => col.dropNotNull()).execute();
  await db.schema.alterTable('players').addColumn('appearance_name', 'text').execute();
  const { rows } = await sql<{ id: number; name: string }>`select id, name from players where name is not null`.execute(db);
  for (const player of rows) {
    const key = playerPortraitKey(player.name);
    if (key) await sql`update players set appearance_name = ${key} where id = ${player.id}`.execute(db);
  }
}

export async function down(db: Kysely<unknown>) {
  // 回退前需为无昵称的玩家补填昵称，沿用原来的唯一性约束。
  await db.schema.alterTable('players').alterColumn('name', col => col.setNotNull()).execute();
  await db.schema.alterTable('players').dropColumn('appearance_name').execute();
}
