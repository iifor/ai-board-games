import { sql, type Kysely } from 'kysely';

// 身份码：管理员发给 C 端用户的开局凭据。只存明文码的哈希与末 4 位；
// generation 在重新生成时递增，旧码换来的凭证随之失效。对局记录由哪个身份码发起，删除身份码时置空。

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.createTable('access_codes')
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('username', 'text', (col) => col.notNull())
    .addColumn('code_hash', 'text', (col) => col.notNull().unique())
    .addColumn('code_hint', 'text', (col) => col.notNull())
    .addColumn('generation', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
    .addColumn('max_matches', 'integer')
    .addColumn('used_matches', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('disabled', 'boolean', (col) => col.notNull().defaultTo(false))
    .addColumn('last_used_at', 'timestamptz')
    .addColumn('created_by', 'integer', (col) => col.references('admin_users.id').onDelete('set null'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
  await sql`alter table matches add column access_code_id integer references access_codes(id) on delete set null`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`alter table matches drop column if exists access_code_id`.execute(db);
  await db.schema.dropTable('access_codes').ifExists().execute();
}
