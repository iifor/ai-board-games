import type { Kysely } from 'kysely';

// 模型：系统自动停用的原因与时间；音色：语言、性别、风格、语速、音调、试听文本、说明。

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('models')
    .addColumn('disabled_reason', 'text')
    .addColumn('disabled_at', 'timestamptz')
    .execute();

  await db.schema.alterTable('voices')
    .addColumn('language', 'text', (col) => col.notNull().defaultTo('zh-CN'))
    .addColumn('gender', 'text')
    .addColumn('style', 'text', (col) => col.notNull().defaultTo(''))
    .addColumn('rate', 'text', (col) => col.notNull().defaultTo('0%'))
    .addColumn('pitch', 'text', (col) => col.notNull().defaultTo('0%'))
    .addColumn('sample_text', 'text', (col) => col.notNull().defaultTo(''))
    .addColumn('description', 'text', (col) => col.notNull().defaultTo(''))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('voices')
    .dropColumn('language').dropColumn('gender').dropColumn('style').dropColumn('rate')
    .dropColumn('pitch').dropColumn('sample_text').dropColumn('description')
    .execute();
  await db.schema.alterTable('models').dropColumn('disabled_reason').dropColumn('disabled_at').execute();
}
