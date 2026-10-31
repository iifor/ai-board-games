import { sql, type Kysely } from 'kysely';

// 迁移使用不带插件的 Kysely 实例，列名直接写 snake_case。

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.createTable('admin_users')
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('username', 'text', (col) => col.notNull().unique())
    .addColumn('password_hash', 'text', (col) => col.notNull())
    .addColumn('must_change_password', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema.createTable('model_providers')
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('name', 'text', (col) => col.notNull().unique())
    .addColumn('base_url', 'text', (col) => col.notNull())
    .addColumn('api_key_encrypted', 'text', (col) => col.notNull())
    .addColumn('api_key_hint', 'text', (col) => col.notNull())
    .addColumn('enabled', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema.createTable('models')
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('provider_id', 'integer', (col) => col.notNull().references('model_providers.id').onDelete('restrict'))
    .addColumn('name', 'text', (col) => col.notNull().unique())
    .addColumn('model', 'text', (col) => col.notNull())
    .addColumn('temperature', 'numeric', (col) => col.notNull().defaultTo(0.7))
    .addColumn('max_tokens', 'integer', (col) => col.notNull().defaultTo(1024))
    .addColumn('fallback_model_id', 'integer', (col) => col.references('models.id').onDelete('set null'))
    .addColumn('enabled', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema.createTable('voices')
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('name', 'text', (col) => col.notNull().unique())
    .addColumn('provider', 'text', (col) => col.notNull())
    .addColumn('voice_name', 'text', (col) => col.notNull())
    .addColumn('enabled', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema.createTable('players')
    .addColumn('id', 'serial', (col) => col.primaryKey())
    .addColumn('name', 'text', (col) => col.notNull().unique())
    .addColumn('avatar', 'text')
    .addColumn('persona', 'text', (col) => col.notNull().defaultTo(''))
    .addColumn('model_id', 'integer', (col) => col.notNull().references('models.id').onDelete('restrict'))
    .addColumn('voice_id', 'integer', (col) => col.references('voices.id').onDelete('set null'))
    .addColumn('enabled', 'boolean', (col) => col.notNull().defaultTo(true))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of ['players', 'voices', 'models', 'model_providers', 'admin_users']) {
    await db.schema.dropTable(table).ifExists().execute();
  }
}
