import { DEFAULT_PRUNE_EVERY, type WindowStore, type WindowStoreOptions } from '../../utils/windowStore';
import type { RequestWindowRepository } from './repository';

/**
 * 数据库实现的滑动窗口存储：多实例共享同一份计数。
 * 清理策略：每 pruneEvery 次 add 顺带删掉早于 retentionMs 的记录（与插入同一条语句），表的大小由保留期内的请求数决定。
 */
export function createDbWindowStore(repository: RequestWindowRepository, options: WindowStoreOptions): WindowStore {
  const pruneEvery = options.pruneEvery ?? DEFAULT_PRUNE_EVERY;
  let adds = 0;
  return {
    count: repository.count,
    async add(key, at) {
      adds += 1;
      if (adds % pruneEvery === 0) await repository.addAndPrune(key, at, new Date(at.getTime() - options.retentionMs));
      else await repository.add(key, at);
    },
    clear: repository.clear,
    prune: repository.prune,
  };
}
