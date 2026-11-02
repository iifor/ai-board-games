import type { Kysely } from 'kysely';

// 对局：混沌脚本。脚本化调试局可选用引擎的混沌脚本代替默认脚本，以固定概率弃票、放弃、声明（如自爆）、
// 给出非法输出或模拟模型调用失败，用于检查舞台对这些情况的呈现。

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('matches')
    .addColumn('chaos', 'boolean', (col) => col.notNull().defaultTo(false))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('matches').dropColumn('chaos').execute();
}
