const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const MAX_TRACKED_SUBJECTS = 10_000;

type FailureState = {
  failures: number;
  expiresAt: number;
};

export class LoginRateLimiter {
  private readonly failures = new Map<string, FailureState>();
  private readonly capacity: number;

  constructor(
    private readonly now: () => number = Date.now,
    capacity = MAX_TRACKED_SUBJECTS,
  ) {
    this.capacity = Math.min(MAX_TRACKED_SUBJECTS, Math.max(1, capacity));
  }

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

  registerAttempt(ip: string, username: string): { allowed: boolean; retryAfterSeconds: number } {
    const result = this.check(ip, username);
    if (result.allowed) this.recordFailure(ip, username);
    return result;
  }

  recordFailure(ip: string, username: string): void {
    const key = this.key(ip, username);
    const now = this.now();
    const state = this.failures.get(key);
    if (state && state.expiresAt > now) {
      state.failures += 1;
      return;
    }
    this.failures.delete(key);
    this.makeRoom(now);
    this.failures.set(key, { failures: 1, expiresAt: now + WINDOW_MS });
  }

  clear(ip: string, username: string): void {
    this.failures.delete(this.key(ip, username));
  }

  private key(ip: string, username: string): string {
    return `${ip}|${username.trim().toLowerCase()}`;
  }

  private makeRoom(now: number): void {
    if (this.failures.size < this.capacity) return;

    // ponytail: fixed in-process ceiling; use WAF/Redis for multi-instance rate limits.
    for (const [key, state] of this.failures) {
      if (state.expiresAt <= now) this.failures.delete(key);
    }
    if (this.failures.size < this.capacity) return;

    const oldestKey = this.failures.keys().next().value;
    if (oldestKey) this.failures.delete(oldestKey);
  }
}
