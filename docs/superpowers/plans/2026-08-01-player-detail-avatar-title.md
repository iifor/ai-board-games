# Player Detail Avatar Title Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the existing player avatar from behind the character cutout to immediately before the nickname in every shared player-detail modal.

**Architecture:** Keep the change inside the existing shared `PlayerDetailModal`. Reuse `PlayerAvatar` in a new title-row wrapper, remove it from the portrait region, and keep every game adapter and authorized match field unchanged.

**Tech Stack:** React 18, TypeScript, component-scoped CSS, Node test runner, Vite.

## Global Constraints

- Apply the layout through the shared modal used by the game clients.
- Reuse the existing `PlayerAvatar`; add no dependency, asset, icon map, API, database field, or shared type.
- The portrait region contains only the transparent character cutout.
- The title region renders `PlayerAvatar` before `displayTitle`.
- Missing avatars continue to fall back to the nickname initial.
- Game-specific match fields and authorization boundaries remain unchanged.
- Preserve unrelated working-tree changes and stage only files named by each task.

---

### Task 1: Move the avatar into the shared title row

**Files:**
- Modify: `tests/unit/playerDetailModal.test.ts:18-52`
- Modify: `packages/client/src/components/common/PlayerDetailModal/index.tsx:46-64`
- Modify: `packages/client/src/components/common/PlayerDetailModal/index.css`

**Interfaces:**
- Consumes: `PlayerAvatar({ player, className, fallback })` and the existing `displayTitle: string`.
- Produces: `.player-detail-title` containing `.player-detail-avatar` followed by `<h3>`.

- [ ] **Step 1: Write the failing structure assertion**

Add these assertions to the first shared-modal test after `html` is rendered:

```ts
const portraitMarkup = html.slice(
  html.indexOf('player-detail-portrait'),
  html.indexOf('player-detail-content'),
);
const titleMarkup = html.slice(
  html.indexOf('player-detail-title'),
  html.indexOf('</header>'),
);

assert.doesNotMatch(portraitMarkup, /player-detail-avatar/);
assert.match(titleMarkup, /player-detail-avatar[\s\S]*<h3>ChatGPT<\/h3>/);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --preserve-symlinks --preserve-symlinks-main .\tests\unit\runUnitTests.cjs playerDetailModal.test.ts
```

Expected: the shared-modal test fails because `player-detail-title` does not exist and the avatar remains inside `player-detail-portrait`.

- [ ] **Step 3: Move the existing avatar in JSX**

Change the shared modal body to this structure:

```tsx
<div className="player-detail-portrait" aria-label={`${displayTitle}人物形象`}>
  {poster && (
    <img
      className="player-detail-cutout"
      src={poster}
      alt=""
      onError={(event) => {
        event.currentTarget.hidden = true;
      }}
    />
  )}
</div>
<div className="player-detail-content">
  <header className="player-detail-head">
    <div className="player-detail-title">
      <PlayerAvatar player={player} className="player-detail-avatar" fallback={displayTitle} />
      <h3>{displayTitle}</h3>
    </div>
    {subtitle?.trim() && <p>{subtitle}</p>}
  </header>
```

- [ ] **Step 4: Replace portrait-overlay avatar CSS with title-row CSS**

Add the title row:

```css
.player-detail-title {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 14px;
}
```

Replace `.player-detail-avatar` with:

```css
.player-detail-avatar {
  display: grid;
  flex: 0 0 52px;
  width: 52px;
  height: 52px;
  border: 2px solid rgba(126, 181, 255, 0.72);
  border-radius: 50%;
  color: #ffffff;
  background: rgba(3, 13, 35, 0.9) center / cover;
  box-shadow: 0 0 22px rgba(53, 127, 255, 0.24);
  font-size: 20px;
  font-weight: 900;
  place-items: center;
}
```

Give the heading `min-width: 0` and retain its existing padding, type scale, color, line height, and shadow.

- [ ] **Step 5: Run focused and client checks**

Run:

```powershell
node --preserve-symlinks --preserve-symlinks-main .\tests\unit\runUnitTests.cjs playerDetailModal.test.ts
pnpm.cmd --filter @ai-presenter/client run check
pnpm.cmd run build:client
```

Expected: all commands exit successfully.

- [ ] **Step 6: Commit the implementation**

```powershell
git add -- packages/client/src/components/common/PlayerDetailModal/index.tsx packages/client/src/components/common/PlayerDetailModal/index.css tests/unit/playerDetailModal.test.ts
git commit -m "feat: move player avatar beside detail nickname"
```

---

### Task 2: Document and visually verify the shared result

**Files:**
- Modify: `docs/project-client.md:278`
- Modify: `design-qa.md`

**Interfaces:**
- Consumes: the completed shared `PlayerDetailModal` from Task 1.
- Produces: current client documentation and screenshot-backed QA evidence.

- [ ] **Step 1: Correct the client presentation rule**

Replace the shared-detail sentence with:

```md
- 各游戏现有“查看玩家详情”入口复用通用人物详情弹窗：左侧展示透明全身人物形象，右侧标题统一显示“玩家头像 + 昵称”，头像缺失时回退昵称首字；基础区显示性别和性格，本局信息只展示调用方已有的非空公开字段。该弹窗不新增游戏入口，不改变席位交互、身份权限、实时/回放数据或服务端规则。
```

- [ ] **Step 2: Start the existing client and open the selected source state**

Run:

```powershell
cmd.exe /c pnpm.cmd run dev:client
```

Use the Codex in-app browser, open the existing game route that exposes the shared player-detail modal, and open the same player-detail state shown in the supplied screenshot.

- [ ] **Step 3: Verify the visible contract**

Confirm in the browser:

- the left portrait has no avatar disc behind the cutout;
- the title reads visually as avatar followed by nickname;
- avatar fallback renders the nickname initial for a player without an avatar;
- the close button, player fields, authorized match fields, and narrow layout still work;
- the browser console contains no new warning or error.

- [ ] **Step 4: Compare source and implementation**

Capture the implemented modal at the same viewport and state as:

```text
C:\Users\Administrator\AppData\Local\Temp\codex-clipboard-ecf06976-dbb3-41b7-8755-93ef8de48aaa.png
```

Open the source and implementation together, then append a QA section to `design-qa.md`. Fix every P0/P1/P2 mismatch before setting:

```md
final result: passed
```

- [ ] **Step 5: Run final hygiene checks**

Run:

```powershell
git diff --check
git status --short
```

Expected: no whitespace error; unrelated pre-existing changes remain untouched.

- [ ] **Step 6: Commit the documentation only**

```powershell
git add -- docs/project-client.md
git commit -m "docs: describe player avatar title layout"
```

Leave `design-qa.md` unstaged because it already contains unrelated working-tree evidence.
