import type { Transaction } from 'kysely';
import type { Db } from '../../db/database';
import { assetLock } from '../../db/locks';
import type { Database } from '../../db/schema';

type Executor = Db | Transaction<Database>;

export interface NewMediaAsset {
  readonly provider: string;
  readonly voiceName: string;
  readonly mime: string;
  readonly data: Buffer;
}

/** 持锁事务里对同一个音频的读写 */
export interface LockedAsset {
  exists(): Promise<boolean>;
  insert(values: NewMediaAsset): Promise<void>;
}

export function createMediaRepository(db: Db) {
  const exists = async (id: string, executor: Executor): Promise<boolean> =>
    Boolean(await executor.selectFrom('mediaAssets').select('id').where('id', '=', id).executeTakeFirst());

  return {
    find: (id: string) => db.selectFrom('mediaAssets').selectAll().where('id', '=', id).executeTakeFirst(),
    exists: (id: string) => exists(id, db),
    /**
     * 在持有该音频 advisory lock 的事务里执行 work（再查 → 合成 → 写入）：
     * 另一实例对同一音频的合成会等到这里提交，然后在自己的 work 里发现已有缓存，不再付费合成。
     */
    locked: <T>(id: string, work: (asset: LockedAsset) => Promise<T>): Promise<T> =>
      db.transaction().execute(async (trx) => {
        await assetLock(trx, id);
        return work({
          exists: () => exists(id, trx),
          insert: async (values) => {
            await trx.insertInto('mediaAssets').values({ id, ...values }).onConflict((oc) => oc.column('id').doNothing()).execute();
          },
        });
      }),
  };
}

export type MediaRepository = ReturnType<typeof createMediaRepository>;
