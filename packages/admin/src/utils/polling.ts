/** 下一次轮询前等待的毫秒数；null 表示停止轮询 */
export type NextPoll = number | null;

/**
 * setTimeout 链式轮询：立即执行一次 step，上一次结束（无论成败）后才按它返回的等待时间安排下一次，
 * 慢请求不会叠在一起。step 自己负责把业务错误转成等待时间；它抛出的异常属于程序错误，记日志并停止。
 * 返回的函数停止轮询（已在进行的 step 跑完后不再安排下一次）。
 */
export function startPolling(step: () => Promise<NextPoll>): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const run = async () => {
    timer = null;
    let next: NextPoll;
    try {
      next = await step();
    } catch (error) {
      console.error('[polling] 轮询出错，已停止', error);
      return;
    }
    if (!stopped && next !== null) timer = setTimeout(() => void run(), next);
  };
  void run();
  return () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
  };
}

/** 连续失败时的退避：base × 2^(failures-1)，封顶 max；failures 为 0 时就是 base */
export function backoffDelay(baseMs: number, failures: number, maxMs: number): number {
  return Math.min(maxMs, baseMs * 2 ** Math.max(0, failures - 1));
}
