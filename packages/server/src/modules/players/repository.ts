import { sql, type ExpressionBuilder, type Insertable, type SqlBool, type Updateable } from 'kysely';
import type { Db } from '../../db/database';
import type { Database, PlayersTable } from '../../db/schema';

function modelFields(eb: ExpressionBuilder<Database, 'players'>) {
  const model = eb.selectFrom('models').whereRef('models.id', '=', 'players.modelId');
  return [model.select('models.name').as('modelName'), model.select('models.model').as('modelKey')];
}

/**
 * 玩家能真正调用模型：主模型或其备用模型启用，且所属供应商启用（与 AI worker 的模型链一致）。
 * 模型因额度耗尽被自动停用、或供应商被停用后，这些玩家不再出现在公开选人列表，也不能开局。
 */
const hasUsableModel = sql<SqlBool>`exists (
  select 1 from models m join model_providers p on p.id = m.provider_id
  where m.enabled and p.enabled
    and (m.id = players.model_id or m.id = (select f.fallback_model_id from models f where f.id = players.model_id)))`;

export function createPlayerRepository(db: Db) {
  const read = () => db.selectFrom('players').leftJoin('models', 'models.id', 'players.modelId')
    .selectAll('players').select(['models.name as modelName', 'models.model as modelKey']);
  return {
    list: () => read().orderBy('players.id').execute(),
    listPlayable: () => read().where('players.enabled', '=', true).where(hasUsableModel).orderBy('players.id').execute(),
    /** 给定玩家中能真正调用模型的那些 */
    async withUsableModel(ids: readonly number[]): Promise<ReadonlySet<number>> {
      if (!ids.length) return new Set();
      const rows = await db.selectFrom('players').select('id').where('id', 'in', [...ids]).where(hasUsableModel).execute();
      return new Set(rows.map((row) => row.id));
    },
    findMany: (ids: readonly number[]) =>
      ids.length ? read().where('players.id', 'in', [...ids]).execute() : Promise.resolve([]),
    find: (id: number) => read().where('players.id', '=', id).executeTakeFirst(),
    create: (values: Insertable<PlayersTable>) => db.insertInto('players').values(values).returningAll().returning(modelFields).executeTakeFirstOrThrow(),
    update: (id: number, values: Updateable<PlayersTable>) =>
      db.updateTable('players').set({ ...values, updatedAt: new Date() }).where('id', '=', id).returningAll().returning(modelFields).executeTakeFirst(),
    remove: (id: number) => db.deleteFrom('players').where('id', '=', id).executeTakeFirst(),
  };
}

export type PlayerRepository = ReturnType<typeof createPlayerRepository>;
export type PlayerRow = NonNullable<Awaited<ReturnType<PlayerRepository['find']>>>;
