# 管理员首次登录强制改密 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使用部署者设置的初始管理员密码创建空库首个账号，并在首次登录后强制修改密码。

**Architecture:** 在 `admin_users` 持久化首次改密标记，认证中间件依据数据库中的实时标记限制管理接口。登录响应驱动管理端跳转到改密页；改密成功后更新哈希、清除标记并签发新令牌。

**Tech Stack:** TypeScript、Express、better-sqlite3、React、Ant Design、node:test。

## Global Constraints

- 不新增依赖，不改动 C 端或 WebSocket 协议。
- 生产 `JWT_SECRET` 至少 32 字符；初始账号和密码必须同时配置，密码至少 12 字符。
- 仅 `admin_users` 为空时创建账号；已有账号绝不创建、禁用、更新或覆盖。
- 新逻辑必须先由 `node:test` 失败测试驱动。

---

### Task 1: 管理员初始化与数据库标记

**Files:**
- Modify: `packages/server/db/migrations.ts`
- Modify: `packages/server/modules/auth/config.ts`
- Modify: `packages/server/modules/auth/index.ts`
- Modify: `packages/server/modules/auth/repository.ts`
- Modify: `packages/server/modules/auth/types.ts`
- Test: `tests/unit/authProductionConfig.test.ts`

**Interfaces:** Produces `AdminUser.must_change_password: number` and `updatePassword(id, passwordHash, mustChangePassword)`.

- [ ] **Step 1: Write the failing test**

```ts
seedAdminUser(db, { username: 'admin', password: 'a-secure-password' });
assert.equal(db.prepare('SELECT must_change_password FROM admin_users').get().must_change_password, 1);
seedAdminUser(db, { username: 'other', password: 'another-secure-password' });
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM admin_users').get().count, 1);
```

- [ ] **Step 2: Verify it fails**

Run: `pnpm.cmd run test:unit -- authProductionConfig.test.ts`

Expected: FAIL because the column and empty-table-only bootstrap do not exist.

- [ ] **Step 3: Write the minimal implementation**

```ts
ensureColumn(db, 'admin_users', 'must_change_password', 'INTEGER NOT NULL DEFAULT 0');
if (countAll(db) > 0 || !admin) return;
db.prepare('INSERT INTO admin_users (username, password_hash, display_name, must_change_password) VALUES (?, ?, ?, 1)')
  .run(admin.username, passwordHash, '管理员');
```

- [ ] **Step 4: Verify it passes**

Run: `pnpm.cmd run test:unit -- authProductionConfig.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/db/migrations.ts packages/server/modules/auth/config.ts packages/server/modules/auth/index.ts packages/server/modules/auth/repository.ts packages/server/modules/auth/types.ts tests/unit/authProductionConfig.test.ts
git commit -m "feat(auth): bootstrap first admin once"
```

### Task 2: 后端强制改密 API

**Files:**
- Modify: `packages/server/modules/auth/controller.ts`
- Modify: `packages/server/modules/auth/middleware.ts`
- Modify: `packages/server/modules/auth/routes.ts`
- Modify: `packages/server/modules/auth/types.ts`
- Create: `tests/unit/authFirstPasswordChange.test.ts`
- Modify: `tests/unit/runUnitTests.cjs`

**Interfaces:** Produces `POST /api/admin/auth/change-password`, login `mustChangePassword`, and `PASSWORD_CHANGE_REQUIRED`.

- [ ] **Step 1: Write the failing test**

```ts
const result = await requestProtectedApi(forcedChangeToken);
assert.equal(result.statusCode, 403);
assert.equal(result.body.code, 'PASSWORD_CHANGE_REQUIRED');
```

- [ ] **Step 2: Verify it fails**

Run: `pnpm.cmd run test:unit -- authFirstPasswordChange.test.ts`

Expected: FAIL because forced-change users are still accepted by protected APIs.

- [ ] **Step 3: Write the minimal implementation**

```ts
if (user.must_change_password && !req.path.endsWith('/change-password')) {
  res.status(403).json({ code: 'PASSWORD_CHANGE_REQUIRED', message: '请先修改初始密码' });
  return;
}
```

- [ ] **Step 4: Verify it passes**

Run: `pnpm.cmd run test:unit -- authFirstPasswordChange.test.ts`

Expected: PASS, including successful password change followed by protected access.

- [ ] **Step 5: Commit**

```bash
git add packages/server/modules/auth/controller.ts packages/server/modules/auth/middleware.ts packages/server/modules/auth/routes.ts packages/server/modules/auth/types.ts tests/unit/authFirstPasswordChange.test.ts tests/unit/runUnitTests.cjs
git commit -m "feat(auth): require initial password change"
```

### Task 3: 管理端改密体验与文档

**Files:**
- Create: `packages/admin/src/pages/ChangePassword/index.tsx`
- Modify: `packages/admin/src/pages/Login/index.tsx`
- Modify: `packages/admin/src/components/AdminPage/index.tsx`
- Modify: `packages/admin/src/services/adminApi.ts`
- Modify: `.env.example`
- Modify: `docs/project-summary.md`
- Modify: `docs/project-server.md`
- Modify: `docs/project-admin.md`

**Interfaces:** Consumes `mustChangePassword`; `/change-password` accepts the API's new token and then enters `/dashboard`.

- [ ] **Step 1: Write the failing check**

```ts
assert.match(readFileSync('packages/admin/src/components/AdminPage/index.tsx', 'utf8'), /change-password/);
assert.match(readFileSync('packages/admin/src/pages/Login/index.tsx', 'utf8'), /mustChangePassword/);
```

- [ ] **Step 2: Verify it fails**

Run: `pnpm.cmd run test:unit -- authFirstPasswordChange.test.ts`

Expected: FAIL because the route and post-login redirect do not exist.

- [ ] **Step 3: Write the minimal implementation**

```tsx
if (loginData.mustChangePassword) {
  setToken(loginData.token);
  navigate('/change-password', { replace: true });
  return;
}
```

- [ ] **Step 4: Verify it passes**

Run: `pnpm.cmd run check; pnpm.cmd run build; pnpm.cmd run test:unit -- authFirstPasswordChange.test.ts`

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/admin/src/pages/ChangePassword/index.tsx packages/admin/src/pages/Login/index.tsx packages/admin/src/components/AdminPage/index.tsx packages/admin/src/services/adminApi.ts .env.example docs/project-summary.md docs/project-server.md docs/project-admin.md
git commit -m "feat(admin): guide first password change"
```

### Task 4: 发布前回归

**Files:** No additional production files.

- [ ] **Step 1: Run the release gates**

Run: `pnpm.cmd run check; pnpm.cmd run build; pnpm.cmd run test:unit; pnpm.cmd run test:workflow; pnpm.cmd run test:migration`

Expected: all commands exit 0.

- [ ] **Step 2: Check the worktree**

Run: `git diff --check; git status --short`

Expected: no whitespace errors and only feature files changed.
