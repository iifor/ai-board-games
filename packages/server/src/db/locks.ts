import { sql, type Transaction } from 'kysely';
import type { Database } from './schema';

// 事务级 advisory lock 的键全部登记在这里，避免不同用途撞键。
// 锁是整个数据库范围的（不分 schema）：共用一个库、不同 schema 的部署会互相等待或跳过，只影响效率不影响正确性。

/** 公开开局：计数 + 插入串行化。单键形式，与下面的两键形式不在同一键空间 */
export const PUBLIC_CREATION_LOCK = 7201;

/** 两键形式 (space, key) 的 space：定时任务与一次性初始化 */
const JOB_LOCK_SPACE = 1;
/** 两键形式的 space：按音频 ID 哈希的 TTS 合成锁 */
const TTS_ASSET_LOCK_SPACE = 2;

export const JOB_LOCKS = {
  /** 无人观看对局的回收：同一时刻只有一个实例清扫 */
  reaper: 1,
  /** 初始管理员创建：多实例同时启动只创建一次 */
  adminBootstrap: 2,
} as const;

export type JobLock = (typeof JOB_LOCKS)[keyof typeof JOB_LOCKS];

/** 等待直到拿到锁；事务结束自动释放 */
export async function jobLock(trx: Transaction<Database>, job: JobLock): Promise<void> {
  await sql`select pg_advisory_xact_lock(${JOB_LOCK_SPACE}, ${job})`.execute(trx);
}

/** 拿不到立即返回 false（另一实例正在做同一件事），拿到则事务结束自动释放 */
export async function tryJobLock(trx: Transaction<Database>, job: JobLock): Promise<boolean> {
  const result = await sql<{ locked: boolean }>`select pg_try_advisory_xact_lock(${JOB_LOCK_SPACE}, ${job}) as locked`.execute(trx);
  return result.rows[0]?.locked === true;
}

/** 按音频 ID 的 hashtext 加锁：同一音频跨实例只合成一次；哈希撞车只是多等一会儿 */
export async function assetLock(trx: Transaction<Database>, assetId: string): Promise<void> {
  await sql`select pg_advisory_xact_lock(${TTS_ASSET_LOCK_SPACE}, hashtext(${assetId}))`.execute(trx);
}
