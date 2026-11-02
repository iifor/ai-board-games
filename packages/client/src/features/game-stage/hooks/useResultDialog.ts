import { useEffect, useState } from 'react';

/** 终局结果卡的开合：对局播完时自动打开（从头回放后再次播完也会再打开）；关掉后舞台保持终局状态，可再查看 */
export function useResultDialog(finished: boolean) {
  const [wanted, setWanted] = useState(true);
  useEffect(() => {
    if (finished) setWanted(true);
  }, [finished]);
  return {
    open: finished && wanted,
    show: () => setWanted(true),
    hide: () => setWanted(false),
  };
}
