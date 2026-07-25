# Undercover v2 Spectator Stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `/game/v2/undercover` 实现为 16:9 环形推理剧场，同时保持经典页面、公开状态边界和现有播放链路不变。

**Architecture:** 使用现有 `variant`/`showPlayerPoster` 边界给 v2 shell 和 arena 增加修饰类，所有新布局都通过 v2 限定 CSS 实现。`UndercoverArena` 继续消费现有公开状态，`PlayerPosterSpotlight` 继续负责图片降级，控制行为和网络数据流不变。

**Tech Stack:** React 18、TypeScript、CSS、Node.js `node:test`、Vite、pnpm workspace

## Global Constraints

- 只改变客户端布局、视觉状态和交互表达。
- 不修改服务端事件、WebSocket、TTS、ACK、回放、游戏规则、API、数据库或共享类型。
- 经典 `/games/undercover` 保持当前工作区视觉；新覆盖样式只能位于 `.undercover-shell--v2` 或 `.undercover-stage--v2` 下。
- 六个席位在准备、发言、投票、淘汰和结束阶段保持固定位置。
- 客户端只展示公开状态，不推断秘密词、卧底身份、合法票型、淘汰或胜负。
- 不增加依赖、自动隐藏控制栏、移动端 JavaScript 布局或新业务组件。
- 保留当前工作区已有改动；每次提交只暂存任务列出的文件，不暂存 `.superpowers/`、`artifacts/`、`.pnpm-store/` 或其他无关文件。

---

## File Map

- Modify: `packages/client/src/features/undercover/UndercoverGame/index.tsx` — 标记 v2 shell，保留状态播报语义。
- Modify: `packages/client/src/features/undercover/UndercoverGame/index.css` — 仅在 v2 隐藏孤立状态胶囊的视觉，保留 `aria-live`。
- Modify: `packages/client/src/features/undercover/components/UndercoverArena.tsx` — 标记 v2/阶段类，并为共享海报传入谁是卧底专用类名。
- Modify: `packages/client/src/features/undercover/components/UndercoverArena.css` — 实现 16:9 环形席位、中央海报、下三分之一字幕和阶段布局。
- Modify: `packages/client/src/features/undercover/components/UndercoverControls.css` — 在 v2 shell 内压缩底部控制栏。
- Modify: `tests/unit/undercoverClient.test.ts` — 锁定 v2 样式隔离、唯一发言者标签、六席位和 reduced-motion。
- Modify: `docs/project-client.md` — 记录 v2 环形观战舞台和展示边界。

不新增运行时代码文件。

---

### Task 1: 建立 v2 样式隔离和阶段标记

**Files:**

- Modify: `tests/unit/undercoverClient.test.ts`
- Modify: `packages/client/src/features/undercover/UndercoverGame/index.tsx`
- Modify: `packages/client/src/features/undercover/components/UndercoverArena.tsx`

**Interfaces:**

- Consumes: `UndercoverGameProps.variant?: 'classic' | 'v2'`、`UndercoverArenaProps.showPlayerPoster?: boolean`、`UndercoverPublicState['status']`
- Produces: `.undercover-shell--v2`、`.undercover-stage--v2`、`.undercover-stage--<status>`、`.undercover-speaker-poster`

- [ ] **Step 1: 写入失败测试**

在 `tests/unit/undercoverClient.test.ts` 的首个舞台测试后增加：

```ts
test('Undercover scopes the spectator theatre to v2 and exposes phase classes', () => {
  const game = readFileSync(resolve('packages/client/src/features/undercover/UndercoverGame/index.tsx'), 'utf8');
  const arena = readFileSync(resolve('packages/client/src/features/undercover/components/UndercoverArena.tsx'), 'utf8');

  assert.match(game, /undercover-shell--v2/);
  assert.match(arena, /undercover-stage--\$\{game\.status\}/);
  assert.match(arena, /undercover-stage--v2/);
  assert.match(arena, /className="undercover-speaker-poster"/);
});
```

- [ ] **Step 2: 验证测试先失败**

Run:

```powershell
pnpm.cmd run test:unit
```

Expected: FAIL，失败项为 `Undercover scopes the spectator theatre to v2 and exposes phase classes`，缺少 `undercover-shell--v2`。

- [ ] **Step 3: 添加最小 v2 修饰类**

将 `UndercoverGame` 的 `<main>` 改为：

```tsx
<main className={variant === 'v2' ? 'undercover-shell undercover-shell--v2' : 'undercover-shell'}>
```

将 `UndercoverArena` 的根节点和海报调用改为：

```tsx
<section
  className={`undercover-stage undercover-stage--${game.status}${showPlayerPoster ? ' undercover-stage--v2' : ''}`}
  aria-label="谁是卧底对局"
>
  {showPlayerPoster && currentPlayer && (
    <PlayerPosterSpotlight player={currentPlayer} className="undercover-speaker-poster" />
  )}
```

不要改变 `useUndercoverGame`、`UndercoverControls` props 或任何公开状态计算。

- [ ] **Step 4: 验证测试通过**

Run:

```powershell
pnpm.cmd run test:unit
```

Expected: PASS，现有谁是卧底秘密信息和回放相关测试仍通过。

- [ ] **Step 5: 提交边界标记**

```powershell
git add -- packages/client/src/features/undercover/UndercoverGame/index.tsx packages/client/src/features/undercover/components/UndercoverArena.tsx tests/unit/undercoverClient.test.ts
git commit -m "refactor(client): scope undercover spectator stage"
```

---

### Task 2: 实现环形推理剧场布局

**Files:**

- Modify: `tests/unit/undercoverClient.test.ts`
- Modify: `packages/client/src/features/undercover/UndercoverGame/index.css`
- Modify: `packages/client/src/features/undercover/components/UndercoverArena.css`
- Modify: `packages/client/src/features/undercover/components/UndercoverControls.css`

**Interfaces:**

- Consumes: Task 1 产生的 `.undercover-shell--v2`、`.undercover-stage--v2`、`.undercover-stage--speaking`、`.undercover-speaker-poster`
- Produces: v2 限定的 16:9 舞台、六个固定席位、唯一发言者视觉、下三分之一字幕、紧凑控制栏

- [ ] **Step 1: 写入失败的样式契约测试**

在 `tests/unit/undercoverClient.test.ts` 增加：

```ts
test('Undercover v2 defines a six-seat ring, one speaker label and reduced motion', () => {
  const arenaStyles = readFileSync(resolve('packages/client/src/features/undercover/components/UndercoverArena.css'), 'utf8');
  const gameStyles = readFileSync(resolve('packages/client/src/features/undercover/UndercoverGame/index.css'), 'utf8');
  const controlStyles = readFileSync(resolve('packages/client/src/features/undercover/components/UndercoverControls.css'), 'utf8');

  assert.match(arenaStyles, /\.undercover-stage--v2\s*\{/);
  for (let seat = 1; seat <= 6; seat += 1) {
    assert.match(arenaStyles, new RegExp(`undercover-stage--v2 \\.seat-${seat}`));
  }
  assert.match(arenaStyles, /\.undercover-stage--v2 \.undercover-speaker-poster > p\s*\{\s*display: none;/);
  assert.match(arenaStyles, /\.undercover-stage--v2\.undercover-stage--speaking \.undercover-focus/);
  assert.match(arenaStyles, /prefers-reduced-motion: reduce/);
  assert.match(gameStyles, /\.undercover-shell--v2 \.undercover-status/);
  assert.match(controlStyles, /\.undercover-shell--v2 \.undercover-controls/);
});
```

- [ ] **Step 2: 验证样式测试先失败**

Run:

```powershell
pnpm.cmd run test:unit
```

Expected: FAIL，缺少 `.undercover-stage--v2` CSS 契约。

- [ ] **Step 3: 在 arena 样式末尾增加 v2 覆盖**

在 `UndercoverArena.css` 末尾追加以下完整区块；不要删除现有基础样式：

```css
.undercover-stage--v2 {
  width: min(100vw, calc((100vh - 24px) * 1.7778));
  aspect-ratio: 16 / 9;
  background-position: center;
}

.undercover-stage--v2::before {
  content: '';
  position: absolute;
  z-index: 2;
  left: 50%;
  top: 54%;
  width: 64%;
  aspect-ratio: 2.15 / 1;
  transform: translate(-50%, -50%);
  border: 1px solid rgba(115, 108, 213, 0.42);
  border-radius: 50%;
  background: radial-gradient(ellipse, rgba(89, 58, 145, 0.16), rgba(5, 9, 28, 0.08) 58%, transparent 72%);
  box-shadow: inset 0 0 46px rgba(112, 74, 178, 0.18), 0 0 56px rgba(32, 47, 112, 0.18);
  pointer-events: none;
}

.undercover-stage--v2 > .undercover-speaker-poster {
  z-index: 2;
}

.undercover-stage--v2 .undercover-speaker-poster::after {
  background: radial-gradient(circle at 50% 42%, transparent 16%, rgba(2, 5, 16, 0.24) 58%, rgba(2, 5, 16, 0.66) 100%);
}

.undercover-stage--v2 .undercover-speaker-poster .player-poster-spotlight__backdrop {
  opacity: 0.22;
}

.undercover-stage--v2 .undercover-speaker-poster .player-poster-spotlight__card {
  width: clamp(250px, 27%, 430px);
  max-height: 67%;
  opacity: 0.96;
  object-position: center top;
  transform: translateY(-4%);
}

.undercover-stage--v2 .undercover-speaker-poster > p {
  display: none;
}

.undercover-stage--v2 .undercover-round-heading {
  top: 2.4%;
  width: 34%;
  min-height: 6.5%;
  font-size: clamp(15px, 1.55vw, 27px);
}

.undercover-stage--v2 .undercover-player-seat {
  width: 12.5%;
  min-width: 104px;
  padding: 0.72%;
  gap: 0.28em;
  border-radius: 14px;
  transition: opacity 240ms ease, border-color 240ms ease, box-shadow 240ms ease, transform 240ms ease;
}

.undercover-stage--v2 .undercover-player-icon {
  width: clamp(48px, 5.4vw, 86px);
}

.undercover-stage--v2 .undercover-player-name {
  max-width: 100%;
  font-size: clamp(10px, 0.88vw, 15px);
}

.undercover-stage--v2 .undercover-player-seat em {
  font-size: clamp(9px, 0.72vw, 12px);
}

.undercover-stage--v2 .undercover-player-seat.is-speaking {
  transform: scale(1.04);
}

.undercover-stage--v2 .seat-1 { top: 18%; left: 9%; }
.undercover-stage--v2 .seat-2 { top: 10.5%; left: 25%; }
.undercover-stage--v2 .seat-3 { top: 10.5%; right: 25%; left: auto; }
.undercover-stage--v2 .seat-4 { top: 18%; right: 9%; left: auto; }
.undercover-stage--v2 .seat-5 { top: 57%; right: 5%; left: auto; bottom: auto; }
.undercover-stage--v2 .seat-6 { top: 57%; left: 5%; right: auto; bottom: auto; }

.undercover-stage--v2 .undercover-focus {
  top: 53%;
  width: 44%;
  min-height: 24%;
  padding: 1.4% 2.2%;
}

.undercover-stage--v2.undercover-stage--speaking .undercover-focus {
  top: auto;
  bottom: 11.5%;
  width: 52%;
  min-height: 13%;
  padding: 1% 1.8%;
  transform: translateX(-50%);
  gap: 0.35em;
  background: rgba(4, 8, 25, 0.88);
  backdrop-filter: blur(12px);
}

.undercover-stage--v2.undercover-stage--speaking .undercover-focus h2 {
  font-size: clamp(18px, 1.8vw, 30px);
}

.undercover-stage--v2.undercover-stage--speaking .undercover-focus > svg {
  height: 14px;
}

.undercover-stage--v2.undercover-stage--speaking .undercover-focus blockquote {
  padding: 0.62em 0.9em;
  font-size: clamp(12px, 1.02vw, 17px);
  text-align: center;
}

@media (max-width: 900px) {
  .undercover-stage--v2 .undercover-player-seat {
    width: 15%;
    min-width: 78px;
    border-radius: 10px;
  }

  .undercover-stage--v2 .undercover-player-icon {
    width: clamp(38px, 6vw, 58px);
  }

  .undercover-stage--v2 .undercover-focus {
    width: 48%;
  }

  .undercover-stage--v2.undercover-stage--speaking .undercover-focus {
    width: 58%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .undercover-stage--v2 .undercover-player-seat,
  .undercover-stage--v2 .player-poster-spotlight__card {
    transition: none;
    transform: none;
  }
}
```

- [ ] **Step 4: 隐藏 v2 孤立状态胶囊但保留播报语义**

在 `UndercoverGame/index.css` 末尾追加：

```css
.undercover-shell--v2 .undercover-status {
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  border: 0;
  clip-path: inset(50%);
  white-space: nowrap;
}
```

不要从 JSX 删除 `aria-live="polite"`。

- [ ] **Step 5: 压缩 v2 控制栏**

在 `UndercoverControls.css` 末尾追加：

```css
.undercover-shell--v2 .undercover-controls {
  bottom: 12px;
  gap: 6px;
  padding: 6px;
  background: rgba(3, 8, 25, 0.8);
}

.undercover-shell--v2 .undercover-controls button {
  min-width: 104px;
  min-height: 40px;
  padding: 0 15px;
  gap: 7px;
  font-size: 13px;
}

.undercover-shell--v2 .undercover-controls button svg {
  width: 17px;
  height: 17px;
}
```

保留现有 `:focus-visible`、`aria-pressed` 和 disabled 行为。

- [ ] **Step 6: 运行单元测试和客户端静态检查**

Run:

```powershell
pnpm.cmd run test:unit
pnpm.cmd --filter @ai-presenter/client run check
```

Expected: 两条命令均退出码 0。

- [ ] **Step 7: 提交剧场布局**

```powershell
git add -- packages/client/src/features/undercover/UndercoverGame/index.css packages/client/src/features/undercover/components/UndercoverArena.css packages/client/src/features/undercover/components/UndercoverControls.css tests/unit/undercoverClient.test.ts
git commit -m "style(client): redesign undercover spectator stage"
```

---

### Task 3: 文档、构建和视觉验收

**Files:**

- Modify: `docs/project-client.md`

**Interfaces:**

- Consumes: Task 1–2 完成的 v2 舞台
- Produces: 项目文档记录和完整验证证据

- [ ] **Step 1: 更新客户端项目文档**

在 `docs/project-client.md` 的谁是卧底说明中，将 `UndercoverArena` 条目补充为：

```markdown
- `UndercoverArena`：经典页面保持当前布局；v2 使用 16:9 环形观战舞台，六席位在所有阶段保持固定坐标，发言阶段只显示一个中央人物海报和一处姓名/状态，下三分之一承载字幕与下一位提示。准备、投票和终局复用中央区域，并且只展示服务端公开状态。
```

在 `v2 玩家发言海报` 小节补充：

```markdown
- 谁是卧底 v2 通过 `.undercover-stage--v2` 限定海报、环形席位和字幕覆盖；共享 `PlayerPosterSpotlight` 的默认标签仅在该舞台隐藏，辩论和狼人杀 v2 不受影响。
```

- [ ] **Step 2: 运行完整客户端验证**

Run:

```powershell
pnpm.cmd run test:unit
pnpm.cmd --filter @ai-presenter/client run check
pnpm.cmd run build:client
```

Expected: 单元测试全部 PASS，TypeScript 检查退出码 0，Vite 客户端生产构建成功。

- [ ] **Step 3: 启动固定端口视觉验证**

Run:

```powershell
pnpm.cmd --filter @ai-presenter/client run dev -- --port 5180 --strictPort
```

在浏览器打开 `http://localhost:5180/game/v2/undercover`，选择六名玩家并开始对局。使用 1920×1080 视口，将页面与已确认参考图 `.superpowers/brainstorm/1865-1784904306/content/design-2.png` 并排检查。

Expected:

- 六个席位均在安全边距内，且环形位置对称稳定。
- 顶部 HUD、中央完整海报、下三分之一字幕和底部控制栏互不遮挡。
- 当前发言者只有一个大型主视觉和一处主姓名/状态。
- 发言者切换不引起席位重排。
- 投票和终局阶段不显示发言海报，只显示已有公开结果。
- 经典 `/games/undercover` 未获得 `.undercover-shell--v2` 或 `.undercover-stage--v2` 覆盖。
- 键盘焦点清晰，淘汰和发言状态包含文字。

- [ ] **Step 4: 检查最终差异**

Run:

```powershell
git diff --check
git status --short
```

Expected: `git diff --check` 无输出；状态中只包含本任务文档改动和执行前已存在的用户改动，不包含新增依赖或服务端文件。

- [ ] **Step 5: 提交文档**

```powershell
git add -- docs/project-client.md
git commit -m "docs(client): document undercover spectator stage"
```

---

## Completion Check

执行结束前再次确认：

- `git diff HEAD~3 --name-only` 不包含 server、shared、数据库或依赖清单。
- `PlayerPosterSpotlight` 的默认 TSX 和共享 CSS 未被修改，其他 v2 游戏不受影响。
- 所有新样式都以 `.undercover-shell--v2` 或 `.undercover-stage--v2` 开头。
- 实时与回放继续通过同一 `UndercoverGame`、`useUndercoverGame` 和公开状态渲染。
