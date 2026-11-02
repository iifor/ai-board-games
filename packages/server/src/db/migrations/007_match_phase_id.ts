import { sql, type Kysely } from 'kysely';

// 对局：当前阶段单独成列。列表、概要、详情与播放流原先为了一个阶段 ID 读出整份快照（含全部日志），
// 回放时每推送一个事件就读一次；现在只有推进（锁定对局行）、脚本化输出与后台日志才读快照。

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('matches').addColumn('phase_id', 'text').execute();
  await sql`update matches set phase_id = snapshot -> 'cursor' ->> 'phaseId'`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('matches').dropColumn('phase_id').execute();
}
