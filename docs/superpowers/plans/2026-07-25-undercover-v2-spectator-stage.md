# Undercover v2 Spectator Stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `/game/v2/undercover` 优化为 16:9 聚光推理舞台：左右各三席、中央单一人物海报、底部单一字幕带和右下控制坞，同时修复回放跳过导致空白页的问题。

**Architecture:** 继续复用现有 `UndercoverGame`、`UndercoverArena`、`UndercoverControls`、`PlayerPosterSpotlight` 和公开状态 view model。只调整 v2 的 TSX 表达与 scoped CSS；回放问题在共享按钮边界把 React 点击事件转换为无参数调用，不修改 session、WebSocket 或服务端流程。

**Tech Stack:** React 18、TypeScript、CSS、Lucide React、Node.js `node:test`、Vite、pnpm workspace

## Global Constraints

- 只优化 `/game/v2/undercover`；经典 `/games/undercover` 的 DOM、视觉和行为保持不变。
- 目标画幅为 16:9；必须验证 1280×720、1440×810 和 1920×1080。
- 顶部只显示轮次、阶段和发言进度；左右各三席；中央只显示当前人物海报；底部只保留一条发言者/字幕/下一位信息带；控制坞位于右下角。
- 正文与席位关键信息不小于 14px；字幕为 20–24px；可点击目标不小于 44×44px。
- 字幕允许换行，不使用省略号，不遮挡人物面部或控制坞。
- 发言、淘汰等状态同时使用文字与颜色；保留 `aria-live`、`role="alert"`、`aria-pressed`、键盘焦点和 reduced-motion。
- 不修改服务端事件、WebSocket、TTS、ACK、回放协议、游戏规则、API、数据库、共享类型或 `PlayerPosterSpotlight` 共享实现。
- 不增加依赖、新页面、新资产、新动画系统或移动端 JavaScript 布局。
- 已确认视觉目标：`C:\Users\Administrator\.codex\generated_images\019fc045-4362-7d12-9ae1-6b9c68259fb3\call_O7n3X69yXI7XrsGnm3vZ7yQ1.png`。
- 执行前已存在的用户改动必须保留；每次提交只暂存当前任务列出的文件。

---

## File Map

- Modify: `packages/client/src/features/undercover/components/UndercoverControls.tsx` — 把两个回放跳过按钮转换为无参数调用，阻止 React `MouseEvent` 进入状态消息。
- Modify: `packages/client/src/features/undercover/components/UndercoverArena.tsx` — 将发言阶段的大卡片改为单一底部字幕带，保留准备、投票和终局分支。
- Modify: `packages/client/src/features/undercover/components/UndercoverArena.css` — 合并重复 v2 覆盖，实现左右两列席位、中央海报、字幕带和 16:9 响应式约束。
- Modify: `packages/client/src/features/undercover/components/UndercoverControls.css` — 将 v2 控制条移动到右下角并保持 44px 点击目标。
- Modify: `tests/unit/undercoverClient.test.ts` — 锁定跳过按钮边界、单一字幕带、左右席位、控制坞和经典页面隔离。
- Modify: `docs/project-client.md` — 把旧“环形席位”说明更新为已确认的“左右两列聚光舞台”。
- Verify only: `packages/client/src/features/undercover/UndercoverGame/index.css` — 现有 v2 `aria-live` 状态保持视觉隐藏，`role="alert"` 错误继续可见；没有证据需要修改。

不新增或删除运行时代码文件。

---

### Task 1: 修复回放跳过事件注入

**Files:**

- Modify: `tests/unit/undercoverClient.test.ts`
- Modify: `packages/client/src/features/undercover/components/UndercoverControls.tsx:51-82`

**Interfaces:**

- Consumes: `UndercoverControlsProps.onSkipPhase: () => void`
- Produces: 两个按钮均执行 `() => onSkipPhase()`，不再把 React `MouseEvent` 传给 `skipCurrentReplayPhase(message?: string)`

- [ ] **Step 1: 写入失败测试**

在 `tests/unit/undercoverClient.test.ts` 的 controls 测试后增加：

```ts
test('Undercover replay skip buttons never forward React click events', () => {
  const source = readFileSync(
    resolve('packages/client/src/features/undercover/components/UndercoverControls.tsx'),
    'utf8',
  );

  assert.doesNotMatch(source, /onClick=\{onSkipPhase\}/);
  assert.equal(
    source.match(/onClick=\{\(\) => onSkipPhase\(\)\}/g)?.length,
    2,
  );
});
```

- [ ] **Step 2: 运行目标测试并确认失败**

Run:

```powershell
pnpm.cmd run test:unit -- undercoverClient.test.ts
```

Expected: FAIL，`Undercover replay skip buttons never forward React click events` 匹配到 `onClick={onSkipPhase}`。

- [ ] **Step 3: 在按钮边界做最小修复**

将 classic 和 v2 两个跳过按钮的点击处理都改为：

```tsx
onClick={() => onSkipPhase()}
```

不要修改 `useGameSocketSession.skipCurrentReplayPhase(message?: string)`；该可选消息参数仍供程序调用者使用。

- [ ] **Step 4: 运行目标测试并确认通过**

Run:

```powershell
pnpm.cmd run test:unit -- undercoverClient.test.ts
```

Expected: `undercoverClient.test.ts` 全部 PASS，退出码 0。

- [ ] **Step 5: 提交根因修复**

```powershell
git add -- packages/client/src/features/undercover/components/UndercoverControls.tsx tests/unit/undercoverClient.test.ts
git commit -m "fix(client): guard undercover replay skip handler"
```

---

### Task 2: 将发言内容收敛为单一字幕带

**Files:**

- Modify: `tests/unit/undercoverClient.test.ts`
- Modify: `packages/client/src/features/undercover/components/UndercoverArena.tsx:1-1`
- Modify: `packages/client/src/features/undercover/components/UndercoverArena.tsx:158-167`

**Interfaces:**

- Consumes: `view.currentSpeakerId`、`view.currentSpeech?.text`、`view.nextPlayer`
- Produces: `.undercover-speaker-strip`、`.undercover-speaker-identity`、`.undercover-speaker-copy`、`.undercover-next-player`

- [ ] **Step 1: 写入失败的发言结构测试**

在 `tests/unit/undercoverClient.test.ts` 的 arena DOM 隔离测试后增加：

```ts
test('Undercover v2 speaking uses one lower-third strip without a duplicate speech card', () => {
  const classic = renderToStaticMarkup(createElement(undercoverComponents.UndercoverArena, {
    game: speakingGame(1),
    variant: 'classic',
  }));
  const v2 = renderToStaticMarkup(createElement(undercoverComponents.UndercoverArena, {
    game: speakingGame(1),
    variant: 'v2',
  }));

  assert.match(v2, /class="undercover-speaker-strip"/);
  assert.match(v2, /class="undercover-speaker-identity"/);
  assert.match(v2, /class="undercover-speaker-copy"/);
  assert.match(v2, /class="undercover-next-player"/);
  assert.doesNotMatch(v2, /<h2>正在发言<\/h2>/);
  assert.doesNotMatch(classic, /undercover-speaker-strip/);
});
```

- [ ] **Step 2: 运行目标测试并确认失败**

Run:

```powershell
pnpm.cmd run test:unit -- undercoverClient.test.ts
```

Expected: FAIL，v2 markup 缺少 `undercover-speaker-strip`。

- [ ] **Step 3: 替换 v2 speaking 分支**

从 `UndercoverArena.tsx` 删除未再使用的 `AudioLines` import，并将 `game.status === 'speaking'` 分支替换为：

```tsx
{game.status === 'speaking' && (
  <div className="undercover-speaker-strip">
    <span className="undercover-speaker-identity">
      <small>当前发言</small>
      <strong>
        {view.currentSpeakerId
          ? getUndercoverPlayerLabel(game, view.currentSpeakerId)
          : '等待发言'}
      </strong>
    </span>
    <blockquote className="undercover-speaker-copy">
      {view.currentSpeech?.text || '首位玩家正在整理描述。'}
    </blockquote>
    <span className="undercover-next-player">
      <small>{view.nextPlayer ? '下一位' : '发言顺序'}</small>
      <strong>
        {view.nextPlayer
          ? getUndercoverPlayerLabel(game, view.nextPlayer.id)
          : '本轮最后一位'}
      </strong>
    </span>
  </div>
)}
```

保留外层 `.undercover-focus[aria-live="polite"]`，并保持 setup、voting、completed 分支原有公开状态逻辑。

- [ ] **Step 4: 运行目标测试并确认通过**

Run:

```powershell
pnpm.cmd run test:unit -- undercoverClient.test.ts
```

Expected: `undercoverClient.test.ts` 全部 PASS，经典 markup 中没有新字幕带。

- [ ] **Step 5: 提交字幕结构**

```powershell
git add -- packages/client/src/features/undercover/components/UndercoverArena.tsx tests/unit/undercoverClient.test.ts
git commit -m "refactor(client): simplify undercover speaker strip"
```

---

### Task 3: 实现左右两列舞台和右下控制坞

**Files:**

- Modify: `tests/unit/undercoverClient.test.ts`
- Modify: `packages/client/src/features/undercover/components/UndercoverArena.css:109-449`
- Modify: `packages/client/src/features/undercover/components/UndercoverControls.css:30-88`

**Interfaces:**

- Consumes: Task 2 的四个字幕类名和现有 `.seat-1` 至 `.seat-6`
- Produces: 单一 `.undercover-stage--v2` 根规则、左侧 1–3 席、右侧 4–6 席、居中海报、底部字幕和右下控制坞

- [ ] **Step 1: 更新失败的 CSS 契约测试**

用下面的测试替换现有 `Undercover v2 layout CSS remains scoped to explicit v2 classes`：

```ts
test('Undercover v2 CSS defines side columns, one subtitle strip and a right control dock', () => {
  const arenaStyles = readFileSync(
    resolve('packages/client/src/features/undercover/components/UndercoverArena.css'),
    'utf8',
  );
  const controlStyles = readFileSync(
    resolve('packages/client/src/features/undercover/components/UndercoverControls.css'),
    'utf8',
  );

  assert.equal(arenaStyles.match(/\.undercover-stage--v2\s*\{/g)?.length, 1);
  for (const seat of [1, 2, 3]) {
    assert.match(arenaStyles, new RegExp(`\\.undercover-stage--v2 \\.seat-${seat} \\{[^}]*left: 3%`, 's'));
  }
  for (const seat of [4, 5, 6]) {
    assert.match(arenaStyles, new RegExp(`\\.undercover-stage--v2 \\.seat-${seat} \\{[^}]*right: 3%`, 's'));
  }
  assert.match(arenaStyles, /\.undercover-stage--v2\.undercover-stage--speaking \.undercover-focus/);
  assert.match(arenaStyles, /\.undercover-speaker-strip\s*\{[^}]*grid-template-columns:/s);
  assert.match(arenaStyles, /\.undercover-speaker-copy\s*\{[^}]*font-size: clamp\(20px,/s);
  assert.doesNotMatch(
    arenaStyles,
    /\.undercover-stage--v2 \.undercover-player-name strong\s*\{[^}]*text-overflow:\s*ellipsis/s,
  );
  assert.match(controlStyles, /\.undercover-controls--v2\s*\{[^}]*right: clamp\(/s);
  assert.match(controlStyles, /\.undercover-controls--v2\s*\{[^}]*left: auto/s);
  assert.match(controlStyles, /\.undercover-controls--v2 button\s*\{[^}]*min-height: 44px/s);
  assert.match(arenaStyles, /prefers-reduced-motion: reduce/);
});
```

- [ ] **Step 2: 运行目标测试并确认失败**

Run:

```powershell
pnpm.cmd run test:unit -- undercoverClient.test.ts
```

Expected: FAIL；当前 CSS 有两个 `.undercover-stage--v2` 根规则，席位仍为环形坐标，控制栏仍居中。

- [ ] **Step 3: 合并 v2 舞台根规则并改为左右两列**

保留 `UndercoverArena.css` 第 1–108 行的 classic 样式。把后续重复的 v2 根定义合并为一个，并使用以下布局值：

```css
.undercover-stage--v2 {
  position: relative;
  width: min(100vw, calc((100vh - 24px) * 1.7778));
  aspect-ratio: 16 / 9;
  margin: 0 auto;
  overflow: hidden;
  background: #050918 url('/assets/undercover/stage-background.png') center / cover no-repeat;
  box-shadow: 0 0 80px rgba(41, 69, 156, 0.28);
}

.undercover-stage--v2 .undercover-player-seat {
  width: 17%;
  min-width: 160px;
  min-height: 18%;
  padding: 0.8%;
  gap: 0.35em;
  border-radius: 14px;
  transition: opacity 240ms ease, border-color 240ms ease, box-shadow 240ms ease, transform 240ms ease;
}

.undercover-stage--v2 .seat-1 { top: 13%; left: 3%; }
.undercover-stage--v2 .seat-2 { top: 38%; left: 3%; }
.undercover-stage--v2 .seat-3 { top: 63%; left: 3%; }
.undercover-stage--v2 .seat-4 { top: 13%; right: 3%; left: auto; }
.undercover-stage--v2 .seat-5 { top: 38%; right: 3%; left: auto; }
.undercover-stage--v2 .seat-6 { top: 63%; right: 3%; left: auto; }

.undercover-stage--v2 .undercover-player-name {
  max-width: 100%;
  font-size: clamp(14px, 0.95vw, 17px);
}

.undercover-stage--v2 .undercover-player-name strong {
  overflow: visible;
  text-overflow: clip;
  white-space: normal;
  overflow-wrap: anywhere;
  text-align: center;
}

.undercover-stage--v2 .undercover-player-seat em {
  font-size: clamp(14px, 0.8vw, 15px);
}
```

继续复用现有背景、遮罩、海报、主持人 cutout、投票 tally、终局 reveal 和 reduced-motion 规则；删除被合并根规则覆盖的旧 1487/1058 比例与环形坐标。

- [ ] **Step 4: 样式化单一底部字幕带**

将 speaking 状态的 `.undercover-focus` 变成无独立大卡片的容器，并增加：

```css
.undercover-stage--v2.undercover-stage--speaking .undercover-focus {
  top: auto;
  bottom: 3.2%;
  left: 46%;
  width: 50%;
  min-height: 12%;
  padding: 0;
  transform: translateX(-50%);
  border: 0;
  background: transparent;
  box-shadow: none;
}

.undercover-stage--v2 .undercover-speaker-strip {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(110px, 0.8fr) minmax(0, 2.6fr) minmax(110px, 0.8fr);
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  border: 1px solid rgba(239, 84, 151, 0.72);
  border-radius: 16px;
  background: rgba(4, 8, 25, 0.9);
  backdrop-filter: blur(12px);
}

.undercover-stage--v2 .undercover-speaker-identity,
.undercover-stage--v2 .undercover-next-player {
  display: grid;
  gap: 4px;
  color: #f8f8ff;
  font-size: 14px;
}

.undercover-stage--v2 .undercover-speaker-identity small,
.undercover-stage--v2 .undercover-next-player small {
  color: #ef79a7;
  font-size: 14px;
}

.undercover-stage--v2 .undercover-speaker-copy {
  margin: 0;
  color: #f8f8ff;
  font-size: clamp(20px, 1.45vw, 24px);
  line-height: 1.45;
  overflow-wrap: anywhere;
  text-align: left;
}
```

海报继续隐藏共享 caption；不要修改 `PlayerPosterSpotlight`。

- [ ] **Step 5: 将 v2 控制栏移动到右下角**

把 `.undercover-controls--v2` 和按钮规则改为：

```css
.undercover-controls--v2 {
  position: fixed;
  z-index: 10;
  top: auto;
  right: clamp(12px, 1.5vw, 28px);
  bottom: 12px;
  left: auto;
  transform: none;
  gap: 6px;
  padding: 6px;
  border: 1px solid rgba(88, 119, 198, 0.28);
  border-radius: 999px;
  background: rgba(3, 8, 25, 0.8);
  backdrop-filter: blur(12px);
}

.undercover-controls--v2 button {
  min-width: 82px;
  min-height: 44px;
  padding: 0 12px;
  gap: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-color: rgba(117, 151, 231, 0.62);
  border-radius: 999px;
  color: #f4f6ff;
  background: rgba(8, 20, 52, 0.9);
  font-size: 14px;
  font-weight: 700;
}
```

保留已有 `:hover`、`:focus-visible`、disabled、primary 和图标规则。窄屏 media query 只把按钮 `min-width` 降到 `44px`，字号仍保持 `14px`。

- [ ] **Step 6: 运行目标测试和客户端类型检查**

Run:

```powershell
pnpm.cmd run test:unit -- undercoverClient.test.ts
pnpm.cmd --filter @ai-presenter/client run check
```

Expected: 两条命令退出码均为 0。

- [ ] **Step 7: 提交 v2 视觉布局**

```powershell
git add -- packages/client/src/features/undercover/components/UndercoverArena.css packages/client/src/features/undercover/components/UndercoverControls.css tests/unit/undercoverClient.test.ts
git commit -m "style(client): optimize undercover v2 stage"
```

---

### Task 4: 更新文档并完成运行页面验收

**Files:**

- Modify: `docs/project-client.md:150-159`
- Modify: `docs/project-client.md:245-253`
- Verify: `packages/client/src/features/undercover/UndercoverGame/index.css`

**Interfaces:**

- Consumes: Tasks 1–3 的 v2 舞台和现有 classic/v2 路由
- Produces: 当前代码一致的客户端文档、构建结果、三种 16:9 视口截图和无控制台错误证据

- [ ] **Step 1: 更新谁是卧底模块说明**

将 `docs/project-client.md` 中 `UndercoverArena` 条目改为：

```markdown
- `UndercoverArena`：经典页面保持当前布局；v2 使用 16:9 聚光推理舞台，六席位固定为左右各三席。发言阶段中央只显示一个人物海报，底部单一字幕带承载发言者、完整公开字幕和下一位提示；准备、投票和终局复用中央区域，并且只展示服务端公开状态。
```

将 v2 海报小节中的谁是卧底条目改为：

```markdown
- 谁是卧底 v2 通过 `.undercover-stage--v2` 限定中央海报、左右席位和字幕覆盖；共享 `PlayerPosterSpotlight` 的默认 caption 只在该舞台隐藏，辩论和狼人杀 v2 不受影响。
```

在 `UndercoverControls` 条目后增加：

```markdown
- 回放跳过按钮通过无参数包装调用现有 session 控制函数，避免 React 点击事件进入公开状态消息；WebSocket 仍只发送既有 `skip-phase` 控制消息。
```

- [ ] **Step 2: 运行完整静态验证**

Run:

```powershell
pnpm.cmd run test:unit
pnpm.cmd --filter @ai-presenter/client run check
pnpm.cmd run build:client
git diff --check
```

Expected: 单元测试全部 PASS；TypeScript 检查退出码 0；Vite 客户端生产构建成功；`git diff --check` 无输出。

- [ ] **Step 3: 启动本地页面**

Run:

```powershell
pnpm.cmd --filter @ai-presenter/client run dev -- --port 5180 --strictPort
```

使用本次审计已采用的应用内浏览器打开 `/game/v2/undercover`。从游戏选择页选择六名玩家，进入真实实时对局；再从历史记录入口验证一场回放。不要用伪造字段替代生产事件。

- [ ] **Step 4: 在三种 16:9 视口做视觉对比**

分别使用 1280×720、1440×810 和 1920×1080，对照 Global Constraints 中的已确认参考图检查 setup、speaking、voting、completed 和 replay。

Expected:

- 左右各三席，头像、姓名和文字状态可读；切换阶段和发言者时席位不重排。
- 当前发言席位有洋红描边；淘汰席位同时有文字和去色表现。
- 中央只有一个人物海报，没有独立“正在发言”大卡片。
- 底部字幕完整换行，字号 20–24px，不遮挡人物面部或右下控制坞。
- 顶部 HUD、海报、字幕和控制坞互不遮挡。
- setup、voting、completed 的中央公开信息可读，秘密信息只在 completed reveal 出现。
- 经典 `/games/undercover` 的 DOM 和视觉与修改前一致。

- [ ] **Step 5: 验证回放跳过和可访问性**

在 replay 中点击“跳过阶段”，再连续操作暂停/继续与语音开关。

Expected:

- 跳过后进入下一公开阶段，不出现空白页。
- 控制台没有 `Objects are not valid as a React child` 或其他 React 错误。
- `aria-live` 继续播报状态，错误使用可见 `role="alert"`。
- `aria-pressed` 正确反映播放与语音状态；Tab 焦点可见；所有控制目标至少 44×44px。
- reduced-motion 环境下没有席位或海报过渡。

- [ ] **Step 6: 检查范围并提交文档**

Run:

```powershell
git diff --check
git status --short
git diff --name-only HEAD~3
```

Expected: 本实现只涉及 File Map 中的客户端、测试和文档文件；不包含 server、shared、数据库、依赖清单或执行前用户改动。

```powershell
git add -- docs/project-client.md
git commit -m "docs(client): document undercover v2 stage"
```

---

## Completion Check

- `pnpm.cmd run test:unit`、client `check`、`build:client` 和 `git diff --check` 均通过。
- 1280×720、1440×810、1920×1080 的五种状态均有运行页面证据。
- 回放跳过使用真实事件验证，页面不空白且控制台无 React 错误。
- classic 路由无 v2 新类和新样式影响。
- `PlayerPosterSpotlight`、server、shared、API、数据库、依赖清单均未修改。
