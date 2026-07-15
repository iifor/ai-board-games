interface ClosableServer {
  close(callback: (error?: Error) => void): unknown;
}

interface TimerHandle {
  unref?: () => unknown;
}

interface GracefulShutdownOptions {
  timeoutMs?: number;
  exit?: (code: number) => void;
  setTimer?: (callback: () => void, timeoutMs: number) => TimerHandle;
  clearTimer?: (timer: TimerHandle) => void;
}

function createGracefulShutdownHandler(
  server: ClosableServer,
  options: GracefulShutdownOptions = {},
): (signal: NodeJS.Signals) => void {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const setTimer = options.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
  const clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
  let shuttingDown = false;
  let finished = false;

  return (_signal: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;

    let timer: TimerHandle;
    const finish = (code: number): void => {
      if (finished) return;
      finished = true;
      clearTimer(timer);
      exit(code);
    };
    timer = setTimer(() => finish(1), timeoutMs);
    timer.unref?.();
    server.close((error) => finish(error ? 1 : 0));
  };
}

export { createGracefulShutdownHandler };
export type { GracefulShutdownOptions };
