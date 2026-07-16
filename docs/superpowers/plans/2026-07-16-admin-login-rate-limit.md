# Admin Login Rate Limit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reject repeated failed administrator logins before an attacker can make unlimited password guesses.

**Architecture:** Keep failed-attempt state in the current Node.js process, keyed by the Express client IP and lower-cased username. The login controller checks before password verification, records failures, and clears the state after a success. Tencent Cloud WAF provides a separate IP-level boundary rule.

**Tech Stack:** TypeScript, Express 4, Node.js `node:test`, Node.js standard library.

## Global Constraints

- Allow 5 failed attempts for one IP and username in a 15-minute window; reject the sixth request with HTTP 429.
- Do not add a dependency, database table, Redis instance, or environment variable.
- Counters are process memory; restarting clears them and current Docker Compose deployment has one application instance.
- Preserve the login success response and JWT format.

---

### Task 1: Implement and test the in-memory limiter

**Files:**

- Create: `packages/server/modules/auth/loginRateLimiter.ts`
- Create: `tests/unit/loginRateLimiter.test.ts`
- Modify: `tests/unit/runUnitTests.cjs`

**Interfaces:**

- Produces: `LoginRateLimiter`, constructed with an optional clock `() => number`.
- Produces: `check(ip: string, username: string): { allowed: boolean; retryAfterSeconds: number }`, `recordFailure(ip: string, username: string): void`, and `clear(ip: string, username: string): void`.
- Consumed by: the authentication controller in Task 2.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/loginRateLimiter.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { LoginRateLimiter } from '../../packages/server/modules/auth/loginRateLimiter';

test('blocks the sixth failed login inside fifteen minutes', () => {
  let now = 0;
  const limiter = new LoginRateLimiter(() => now);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal(limiter.check('203.0.113.10', 'Admin').allowed, true);
    limiter.recordFailure('203.0.113.10', 'Admin');
  }
  const result = limiter.check('203.0.113.10', 'admin');
  assert.equal(result.allowed, false);
  assert.ok(result.retryAfterSeconds > 0);
});

test('clears failures after success and expires old failures', () => {
  let now = 0;
  const limiter = new LoginRateLimiter(() => now);
  for (let attempt = 0; attempt < 5; attempt += 1) limiter.recordFailure('203.0.113.10', 'admin');
  limiter.clear('203.0.113.10', 'admin');
  assert.equal(limiter.check('203.0.113.10', 'admin').allowed, true);
  for (let attempt = 0; attempt < 5; attempt += 1) limiter.recordFailure('203.0.113.10', 'admin');
  now = 15 * 60 * 1000;
  assert.equal(limiter.check('203.0.113.10', 'admin').allowed, true);
});
```

Add `'loginRateLimiter.test.ts'` after `'authProductionConfig.test.ts'` in `tests/unit/runUnitTests.cjs`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm.cmd run test:unit -- loginRateLimiter.test.ts`

Expected: failure because `loginRateLimiter.ts` does not exist.

- [ ] **Step 3: Write the minimal limiter**

Create `packages/server/modules/auth/loginRateLimiter.ts`:

```ts
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

interface FailureState { failures: number; expiresAt: number; }
interface LimitResult { allowed: boolean; retryAfterSeconds: number; }

class LoginRateLimiter {
  private readonly failures = new Map<string, FailureState>();
  constructor(private readonly now: () => number = Date.now) {}
  private key(ip: string, username: string): string {
    return `${ip}|${username.trim().toLowerCase()}`;
  }
  check(ip: string, username: string): LimitResult {
    const key = this.key(ip, username);
    const state = this.failures.get(key);
    if (!state || state.expiresAt <= this.now()) {
      this.failures.delete(key);
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (state.failures < MAX_FAILURES) return { allowed: true, retryAfterSeconds: 0 };
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((state.expiresAt - this.now()) / 1000)) };
  }
  recordFailure(ip: string, username: string): void {
    const key = this.key(ip, username);
    const state = this.failures.get(key);
    if (!state || state.expiresAt <= this.now()) {
      this.failures.set(key, { failures: 1, expiresAt: this.now() + WINDOW_MS });
      return;
    }
    state.failures += 1;
  }
  clear(ip: string, username: string): void {
    this.failures.delete(this.key(ip, username));
  }
}
export { LoginRateLimiter };
```

- [ ] **Step 4: Run focused test to verify it passes**

Run: `pnpm.cmd run test:unit -- loginRateLimiter.test.ts`

Expected: 2 passing tests, 0 failures.

- [ ] **Step 5: Commit**

```powershell
git add packages/server/modules/auth/loginRateLimiter.ts tests/unit/loginRateLimiter.test.ts tests/unit/runUnitTests.cjs
git commit -m "feat: limit failed admin logins"
```

### Task 2: Enforce the limiter in the login controller

**Files:**

- Modify: `packages/server/modules/auth/controller.ts`
- Create: `tests/unit/authLoginRateLimit.test.ts`
- Modify: `tests/unit/runUnitTests.cjs`

**Interfaces:**

- Consumes: `LoginRateLimiter` from Task 1.
- Produces: HTTP 429 from `POST /api/admin/auth/login` after the fifth failed password attempt for one IP and username.
- Preserves: existing 400, 401, and successful-login responses.

- [ ] **Step 1: Write the failing controller test**

Create `tests/unit/authLoginRateLimit.test.ts`. Call the exported `login` handler with a unique unknown username, a fixed test IP, and a minimal response object that records `status` and `json`. Assert that the first five requests return 401 and the sixth returns 429 with a positive `data.retryAfterSeconds`.

```ts
for (let attempt = 0; attempt < 5; attempt += 1) {
  const response = createResponse();
  await login(createRequest(ip, username), response.value);
  assert.equal(response.statusCode, 401);
}
const blocked = createResponse();
await login(createRequest(ip, username), blocked.value);
assert.equal(blocked.statusCode, 429);
assert.ok(Number(blocked.body.data.retryAfterSeconds) > 0);
```

Register `'authLoginRateLimit.test.ts'` after `'loginRateLimiter.test.ts'` in `tests/unit/runUnitTests.cjs`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm.cmd run test:unit authLoginRateLimit.test.ts`

Expected: failure because the sixth unknown-user login still returns 401.

- [ ] **Step 3: Integrate the limiter**

In `packages/server/modules/auth/controller.ts`, create one `const loginRateLimiter = new LoginRateLimiter()` and, after the required-field guard, use this code:

```ts
const limit = loginRateLimiter.check(req.ip, username);
if (!limit.allowed) {
  res.status(429).json({ code: 429, message: '登录尝试过于频繁，请稍后再试', data: { retryAfterSeconds: limit.retryAfterSeconds } });
  return;
}
```

Call `loginRateLimiter.recordFailure(req.ip, username)` immediately before each existing 401 response. Call `loginRateLimiter.clear(req.ip, username)` immediately before the successful response. Do not record missing username/password validation errors.

- [ ] **Step 4: Run focused and full unit suite**

Run: `pnpm.cmd run test:unit -- loginRateLimiter.test.ts`

Expected: 3 passing tests, 0 failures.

Run: `pnpm.cmd run test:unit`

Expected: 0 failures.

- [ ] **Step 5: Commit**

```powershell
git add packages/server/modules/auth/controller.ts tests/unit/authLoginRateLimit.test.ts tests/unit/runUnitTests.cjs
git commit -m "fix: reject repeated admin login failures"
```

### Task 3: Document runtime and WAF responsibilities

**Files:**

- Modify: `docs/project-server.md`

**Interfaces:**

- Documents: 5 failures / 15 minutes / IP plus username, HTTP 429, process-memory reset behavior, and WAF responsibility.
- Consumed by: Tencent Cloud operators before deployment.

- [ ] **Step 1: Add precise operations guidance**

Add to the authentication configuration section:

```md
管理员登录在同一客户端 IP 和用户名组合的 15 分钟窗口内最多允许 5 次失败；第六次请求返回 HTTP 429，成功登录会清除该组合的失败计数。计数保存在当前 Node.js 进程内，重启会清除；当前单实例 Compose 部署适用。
```

Add to the Tencent Cloud load-balancer section:

```md
在腾讯云 WAF 为 `POST /api/admin/auth/login` 配置 IP 级频率限制。WAF 限制应覆盖应用进程重启和分布式来源；应用内限流仍按 IP 与用户名组合保护单一账号。
```

- [ ] **Step 2: Verify documentation and release gates**

Run: `git diff --check`

Expected: exit code 0.

Run: `pnpm.cmd run check; pnpm.cmd run build; pnpm.cmd run test:unit; pnpm.cmd run test:workflow; pnpm.cmd run test:migration`

Expected: each command exits 0.

- [ ] **Step 3: Commit**

```powershell
git add docs/project-server.md
git commit -m "docs: document admin login protections"
```
