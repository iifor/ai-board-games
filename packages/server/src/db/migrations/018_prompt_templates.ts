import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>) {
  await sql`create sequence prompt_publication_order`.execute(db);
  await sql`alter table applied_prompts add column publication_order bigint not null default nextval('prompt_publication_order')`.execute(db);
  await sql`create table prompt_templates (
    game_key text not null, template_name text not null, source text not null,
    revision integer not null, publication_order bigint not null default nextval('prompt_publication_order'),
    primary key (game_key, template_name)
  )`.execute(db);
  // 已在运行的旧局没有开局版本记录。保留升级当时对它有效的调试配置。
  await sql`update matches m set snapshot = jsonb_set(snapshot, '{promptSet}',
    jsonb_build_object('sources', '{}'::jsonb, 'trials', (
      select jsonb_object_agg(p.template_name, jsonb_build_object('source', p.source, 'persona', p.persona))
      from applied_prompts p where p.game_key = m.game_key and p.variant_key = coalesce(m.variant_key, '')
    ))) where m.status in ('created','running','waiting_ai','paused') and exists (
      select 1 from applied_prompts p where p.game_key = m.game_key and p.variant_key = coalesce(m.variant_key,'')
    )`.execute(db);
}

export async function down(db: Kysely<unknown>) {
  await db.schema.dropTable('prompt_templates').execute();
  await db.schema.alterTable('applied_prompts').dropColumn('publication_order').execute();
  await sql`drop sequence prompt_publication_order`.execute(db);
}
