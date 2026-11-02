import type { Kysely } from 'kysely';

// AI 任务：领取次数。worker 据此在多次失败后放弃并终止对局，而不是每次领取过期后再付费调用一遍模型。

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('ai_tasks')
    .addColumn('attempts', 'integer', (col) => col.notNull().defaultTo(0))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('ai_tasks').dropColumn('attempts').execute();
}
