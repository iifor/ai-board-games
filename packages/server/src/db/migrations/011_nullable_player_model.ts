import type { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('players').alterColumn('model_id', column => column.dropNotNull()).execute();
}

/** 回滚前需先给所有玩家绑定模型。 */
export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('players').alterColumn('model_id', column => column.setNotNull()).execute();
}
