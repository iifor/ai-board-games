import type { ExpressionBuilder, Insertable, Updateable } from 'kysely';
import type { Db } from '../../db/database';
import type { Database, PlayersTable } from '../../db/schema';

function modelFields(eb: ExpressionBuilder<Database, 'players'>) {
  const model = eb.selectFrom('models').whereRef('models.id', '=', 'players.modelId');
  return [model.select('models.name').as('modelName'), model.select('models.model').as('modelKey')];
}

export function createPlayerRepository(db: Db) {
  const read = () => db.selectFrom('players').leftJoin('models', 'models.id', 'players.modelId')
    .selectAll('players').select(['models.name as modelName', 'models.model as modelKey']);
  return {
    list: () => read().orderBy('players.id').execute(),
    listPlayable: () => read().where('players.enabled', '=', true).where('players.modelId', 'is not', null).orderBy('players.id').execute(),
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
