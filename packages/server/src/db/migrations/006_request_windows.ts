import type { Kysely } from 'kysely';

// 限流与登录锁定的滑动窗口计数：原先是每个进程各一份内存计数，多实例时阈值会乘以实例数。
// 改为按 key 记录时间点，所有实例共享；过期记录在写入时顺带清理（见 modules/limits/store.ts），不需要定时任务。

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.createTable('request_windows')
    .addColumn('key', 'text', (col) => col.notNull())
    .addColumn('at', 'timestamptz', (col) => col.notNull())
    .execute();
  await db.schema.createIndex('request_windows_key_at_idx').on('request_windows').columns(['key', 'at']).execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('request_windows').ifExists().execute();
}
