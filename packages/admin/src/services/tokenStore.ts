const KEY = 'battle-admin-token';

/** 登录令牌只存在本浏览器；存储不可用（隐私模式等）时退化为仅内存 */
let memory: string | null = null;

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(KEY) ?? memory;
    } catch {
      return memory;
    }
  },
  set(token: string): void {
    memory = token;
    try {
      localStorage.setItem(KEY, token);
    } catch {
      // 仅内存
    }
  },
  clear(): void {
    memory = null;
    try {
      localStorage.removeItem(KEY);
    } catch {
      // 忽略
    }
  },
};
