/**
 * 每个实例同时进行的付费合成上限。每次合成在持有该音频 advisory lock 的事务里调用供应商（最长 TTS 超时），
 * 期间占着一个连接池连接；不设上限时匿名观众回放一批无缓存的旧局就能占满连接池，拖住对局推进与后台接口。
 * 排队的请求不占连接。需小于 DATABASE_POOL_MAX（默认 10）。
 */
export const MAX_CONCURRENT_SYNTHESES = 3;
