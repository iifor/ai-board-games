const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

type FailureState = {
  failures: number;
  expiresAt: number;
};

export class LoginRateLimiter {
  private readonly failures = new Map<string, FailureState>();

  constructor(private readonly now: () => number = Date.now) {}

  check(ip: string, username: string): { allowed: boolean; retryAfterSeconds: number } {
    const key = this.key(ip, username);
    const state = this.failures.get(key);
    if (!state || state.expiresAt <= this.now()) {
      this.failures.delete(key);
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (state.failures < MAX_FAILURES) return { allowed: true, retryAfterSeconds: 0 };
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((state.expiresAt - this.now()) / 1000)),
    };
  }

  recordFailure(ip: string, username: string): void {
    const key = this.key(ip, username);
    const now = this.now();
    const state = this.failures.get(key);
    if (state && state.expiresAt > now) {
      state.failures += 1;
      return;
    }
    this.failures.set(key, { failures: 1, expiresAt: now + WINDOW_MS });
  }

  clear(ip: string, username: string): void {
    this.failures.delete(this.key(ip, username));
  }

  private key(ip: string, username: string): string {
    return `${ip}|${username.trim().toLowerCase()}`;
  }
}
