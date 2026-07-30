# Shared Player Detail Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing debate and Werewolf player-detail popups with one shared full-body player profile modal while leaving all game screens, state, protocols, and server behavior unchanged.

**Architecture:** Extend the existing C-side `PlayerDetailModal` so it owns the portrait fallback chain, base profile fields, optional match fields, and all modal styling. Debate passes its existing debate fields; the Werewolf wrapper becomes a thin adapter that passes only currently visible role/status fields. Existing game-specific modal CSS is removed so every current and future caller receives the same visual treatment.

**Tech Stack:** React 18, TypeScript, CSS, Node `node:test`, existing `resolvePlayerPoster`, `PlayerAvatar`, and `BaseModal`.

## Global Constraints

- Only existing player-detail popups change; game stages, seats, playback, realtime state, and replay data remain unchanged.
- Do not add player-detail triggers, pages, REST APIs, shared protocols, database changes, or dependencies.
- Base profile always shows nickname, sex, and personality; missing sex/personality displays `未设置`.
- Empty match fields and the entire empty match section are omitted.
- Werewolf role visibility continues to be controlled exclusively by the existing `roleVisible` prop.
- Full-body cutout failure falls back to the existing avatar, then to the display-name initial.
- Preserve existing backdrop and close-button behavior and keyboard accessibility.

## File Map

- Create `packages/client/src/components/common/PlayerDetailModal/index.css`: single source of truth for the shared modal layout, portrait, responsive behavior, and field sections.
- Create `tests/unit/playerDetailModal.test.ts`: render-level checks for profile fields, optional match fields, portrait mapping, and Werewolf visibility.
- Modify `packages/client/src/components/common/PlayerDetailModal/index.tsx`: render the shared full-body profile layout and filter optional fields.
- Modify `packages/client/src/features/debate/DebateGame/index.tsx`: pass only debate match fields because personality becomes part of the shared base profile.
- Modify `packages/client/src/features/werewolf/components/WerewolfPlayerDetailModal/index.tsx`: replace custom markup with a thin `PlayerDetailModal` adapter.
- Modify `packages/client/src/features/debate/components/DebateTopicDialog/index.css`: remove obsolete player-detail selectors while preserving debate setup styles.
- Modify `packages/client/src/features/werewolf/WerewolfGame/index.css`: remove the obsolete Werewolf-specific player-detail block.
- Modify `packages/client/src/features/werewolf-v2/WerewolfGameV2/index.css`: remove player-detail overrides while preserving thinking-modal styles.
- Modify `tests/unit/runUnitTests.cjs`: include the new focused test in the default unit suite.
- Modify `docs/project-client.md`: document the shared popup ownership and no-gameplay-impact boundary.

---

### Task 1: Build the shared profile modal

**Files:**
- Create: `tests/unit/playerDetailModal.test.ts`
- Create: `packages/client/src/components/common/PlayerDetailModal/index.css`
- Modify: `tests/unit/runUnitTests.cjs`
- Modify: `packages/client/src/components/common/PlayerDetailModal/index.tsx`
- Modify: `packages/client/src/features/debate/DebateGame/index.tsx:303-313`

**Interfaces:**
- Consumes: `resolvePlayerPoster(player, 'cutout'): string | null`, `PlayerAvatar`, `BaseModal`, and the existing `Player` fields.
- Produces: `PlayerDetailModal({ player, title?, subtitle?, fields?, onClose?, ...classNames })`, where `fields` remains `Array<{ label: string; value?: string }>` and blank values are omitted.

- [ ] **Step 1: Write the failing render test**

Create `tests/unit/playerDetailModal.test.ts` with CSS loading disabled before requiring TSX modules:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

const Module = require('node:module') as {
  _extensions: Record<string, (module: unknown, filename: string) => void>;
};
Module._extensions['.css'] = () => {};

const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { PlayerDetailModal } = require(
  '../../packages/client/src/components/common/PlayerDetailModal',
) as typeof import('../../packages/client/src/components/common/PlayerDetailModal');

test('player detail modal renders the shared profile and only populated match fields', () => {
  const html = renderToStaticMarkup(React.createElement(PlayerDetailModal, {
    player: {
      id: 1,
      nickname: 'ChatGPT',
      sex: '女',
      personality: '冷静、善于分析',
    },
    fields: [
      { label: '本局身份', value: '正方一辩' },
      { label: '空字段', value: '' },
    ],
  }));

  assert.match(html, /player-detail-cutout/);
  assert.match(html, /\/player-poster-cutouts\/chatgpt\.webp/);
  assert.match(html, />性别</);
  assert.match(html, />女</);
  assert.match(html, />性格</);
  assert.match(html, /冷静、善于分析/);
  assert.match(html, />本局信息</);
  assert.match(html, /正方一辩/);
  assert.doesNotMatch(html, /空字段/);
});

test('player detail modal hides an empty match section and supplies base fallbacks', () => {
  const html = renderToStaticMarkup(React.createElement(PlayerDetailModal, {
    player: { id: 99, nickname: '自定义玩家' },
    fields: [{ label: '本局身份', value: '   ' }],
  }));

  assert.match(html, /未设置/);
  assert.doesNotMatch(html, />本局信息</);
  assert.match(html, /player-detail-avatar/);
});
```

Add `'playerDetailModal.test.ts'` beside the existing client-display tests in `tests/unit/runUnitTests.cjs`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --preserve-symlinks --preserve-symlinks-main .\tests\unit\runUnitTests.cjs playerDetailModal.test.ts
```

Expected: FAIL because the current modal has no cutout, no automatic sex field, no `本局信息` section, and renders blank fields as `-`.

- [ ] **Step 3: Implement the minimum shared JSX**

Update `PlayerDetailModal/index.tsx` to import its own CSS and the existing poster resolver, then render the fallback layers and filtered sections:

```tsx
import { resolvePlayerPoster } from '../../PlayerPosterSpotlight/posters';
import './index.css';

const visibleFields = fields.filter(
  (field) => field?.label.trim() && field.value?.trim(),
);
const poster = resolvePlayerPoster(player, 'cutout');

<div className="player-detail-layout">
  <div className="player-detail-portrait" aria-label={`${displayTitle}人物形象`}>
    <PlayerAvatar player={player} className="player-detail-avatar" fallback={displayTitle} />
    {poster && (
      <img
        className="player-detail-cutout"
        src={poster}
        alt=""
        onError={(event) => { event.currentTarget.hidden = true; }}
      />
    )}
  </div>
  <div className="player-detail-content">
    <header className="player-detail-head">
      <h3>{displayTitle}</h3>
      {subtitle?.trim() && <p>{subtitle}</p>}
    </header>
    <section className="player-detail-section" aria-labelledby="player-profile-title">
      <h4 id="player-profile-title">玩家资料</h4>
      <dl>
        <div><dt>性别</dt><dd>{player.sex?.trim() || '未设置'}</dd></div>
        <div><dt>性格</dt><dd>{player.personality?.trim() || '未设置'}</dd></div>
      </dl>
    </section>
    {visibleFields.length > 0 && (
      <section className="player-detail-section" aria-labelledby="player-match-title">
        <h4 id="player-match-title">本局信息</h4>
        <dl>
          {visibleFields.map((field) => (
            <div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>
          ))}
        </dl>
      </section>
    )}
  </div>
</div>
```

Keep `BaseModal`, the existing default class-name props, and the current close/backdrop callbacks unchanged.

- [ ] **Step 4: Add one responsive shared stylesheet**

Create `PlayerDetailModal/index.css` with the existing modal class names and new internal classes:

```css
.player-detail-backdrop {
  position: fixed;
  inset: 0;
  z-index: 130;
  display: grid;
  padding: 24px;
  place-items: center;
  background: rgba(0, 4, 18, 0.76);
  backdrop-filter: blur(12px);
}

.player-detail-modal {
  position: relative;
  width: min(760px, calc(100vw - 32px));
  max-height: min(760px, calc(100vh - 32px));
  overflow: auto;
  padding: 24px;
  border: 1px solid rgba(105, 159, 239, 0.56);
  border-radius: 18px;
  color: #eef4ff;
  background: linear-gradient(145deg, rgba(8, 24, 58, 0.98), rgba(3, 10, 30, 0.98));
  box-shadow: 0 28px 88px rgba(0, 0, 0, 0.58), inset 0 0 32px rgba(71, 132, 255, 0.08);
}

.player-detail-layout {
  display: grid;
  grid-template-columns: minmax(220px, 0.85fr) minmax(0, 1.15fr);
  gap: 28px;
}

.player-detail-portrait {
  position: relative;
  min-height: 430px;
  overflow: hidden;
  border-radius: 14px;
  background: radial-gradient(circle at 50% 34%, rgba(78, 139, 255, 0.2), transparent 58%);
}

.player-detail-avatar {
  position: absolute;
  top: 50%;
  left: 50%;
  display: grid;
  width: 128px;
  height: 128px;
  transform: translate(-50%, -50%);
  border: 2px solid rgba(126, 181, 255, 0.72);
  border-radius: 50%;
  background: rgba(3, 13, 35, 0.9) center / cover;
  font-size: 42px;
  font-weight: 900;
  place-items: center;
}

.player-detail-cutout {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.player-detail-close {
  position: absolute;
  z-index: 2;
  top: 14px;
  right: 14px;
  display: grid;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 1px solid rgba(126, 181, 255, 0.3);
  border-radius: 50%;
  color: #eef4ff;
  background: rgba(3, 13, 35, 0.72);
  cursor: pointer;
  place-items: center;
}

.player-detail-close:focus-visible {
  outline: 2px solid #8fe8ff;
  outline-offset: 3px;
}

.player-detail-content,
.player-detail-section,
.player-detail-section dl {
  min-width: 0;
}

.player-detail-head h3,
.player-detail-head p,
.player-detail-section h4,
.player-detail-section dl {
  margin: 0;
}

.player-detail-section {
  margin-top: 22px;
}

.player-detail-section dl > div {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid rgba(126, 163, 232, 0.18);
}

.player-detail-section dd {
  margin: 0;
  overflow-wrap: anywhere;
}

@media (max-width: 640px) {
  .player-detail-modal { padding: 18px; }
  .player-detail-layout { grid-template-columns: 1fr; }
  .player-detail-portrait { min-height: 260px; }
}
```

Retain visible focus styling for the existing close button; do not suppress outlines.

- [ ] **Step 5: Remove the duplicate debate personality row**

In `DebateGame/index.tsx`, keep only match-scoped fields:

```tsx
fields={[
  { label: '本局身份', value: getDebatePlayerLabel(displayGame.players || [], selectedPlayer.id) },
  { label: '身份说明', value: getDebateIdentityDescription(selectedPlayer) }
]}
```

Remove the redundant `subtitle` and `{ label: '性格', ... }` props because the shared modal owns nickname, sex, and personality.

- [ ] **Step 6: Run the focused test and client type check**

Run:

```powershell
node --preserve-symlinks --preserve-symlinks-main .\tests\unit\runUnitTests.cjs playerDetailModal.test.ts
pnpm.cmd --filter @ai-presenter/client run check
```

Expected: both commands exit `0`.

- [ ] **Step 7: Commit Task 1**

```powershell
git add packages/client/src/components/common/PlayerDetailModal/index.tsx packages/client/src/components/common/PlayerDetailModal/index.css packages/client/src/features/debate/DebateGame/index.tsx tests/unit/playerDetailModal.test.ts tests/unit/runUnitTests.cjs
git commit -m "feat(client): add shared player detail modal"
```

---

### Task 2: Adapt Werewolf and remove game-specific modal styling

**Files:**
- Modify: `tests/unit/playerDetailModal.test.ts`
- Modify: `packages/client/src/features/werewolf/components/WerewolfPlayerDetailModal/index.tsx`
- Modify: `packages/client/src/features/debate/components/DebateTopicDialog/index.css`
- Modify: `packages/client/src/features/werewolf/WerewolfGame/index.css:143-241`
- Modify: `packages/client/src/features/werewolf-v2/WerewolfGameV2/index.css:96-100`
- Modify: `docs/project-client.md`

**Interfaces:**
- Consumes: Task 1 `PlayerDetailModal` and `fields: Array<{ label: string; value?: string }>` blank-field filtering.
- Produces: the unchanged `WerewolfPlayerDetailModal({ player, roleVisible, onClose })` public interface backed by the shared modal.

- [ ] **Step 1: Add failing Werewolf visibility tests**

Append to `tests/unit/playerDetailModal.test.ts`:

```ts
const { WerewolfPlayerDetailModal } = require(
  '../../packages/client/src/features/werewolf/components/WerewolfPlayerDetailModal',
) as typeof import('../../packages/client/src/features/werewolf/components/WerewolfPlayerDetailModal');

test('Werewolf adapter shows only currently authorized match fields', () => {
  const player = {
    id: 2,
    nickname: 'Claude Code',
    sex: '男',
    personality: '谨慎',
    role: 'werewolf',
    roleLabel: '狼人',
    faction: 'wolves',
    alive: false,
    deathDay: 2,
    deathReason: '放逐',
  };
  const hidden = renderToStaticMarkup(React.createElement(WerewolfPlayerDetailModal, {
    player,
    roleVisible: false,
    onClose: () => {},
  }));
  const visible = renderToStaticMarkup(React.createElement(WerewolfPlayerDetailModal, {
    player,
    roleVisible: true,
    onClose: () => {},
  }));

  assert.doesNotMatch(hidden, />本局身份</);
  assert.doesNotMatch(hidden, />身份说明</);
  assert.match(hidden, /第 2 天/);
  assert.match(visible, />本局身份</);
  assert.match(visible, /狼人/);
  assert.match(visible, />身份说明</);
});

test('Werewolf adapter omits status when the snapshot has no alive field', () => {
  const html = renderToStaticMarkup(React.createElement(WerewolfPlayerDetailModal, {
    player: { id: 3, nickname: 'Kimi' },
    roleVisible: false,
    onClose: () => {},
  }));
  assert.doesNotMatch(html, />状态</);
  assert.doesNotMatch(html, />本局信息</);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --preserve-symlinks --preserve-symlinks-main .\tests\unit\runUnitTests.cjs playerDetailModal.test.ts
```

Expected: FAIL because the current Werewolf component still owns custom markup and always renders a status row.

- [ ] **Step 3: Replace Werewolf markup with the shared modal**

Keep the existing role resolution and `roleVisible` boundary, then return:

```tsx
const fields = [
  ...(roleVisible ? [
    { label: '本局身份', value: roleText },
    { label: '身份说明', value: getRoleDescription(player, true) },
  ] : []),
  ...(player.alive === undefined ? [] : [{
    label: '状态',
    value: player.alive
      ? '存活'
      : `${player.deathReason || '出局'}${player.deathDay ? ` · 第 ${player.deathDay} 天` : ''}`,
  }]),
];

return (
  <PlayerDetailModal
    player={player}
    fields={fields}
    onClose={onClose}
  />
);
```

Delete the custom avatar, backdrop, dialog, close button, `formatAvatarUrl`, and danger-class code. Do not change the component props or its callers.

- [ ] **Step 4: Remove obsolete game-owned player-detail CSS**

In `DebateTopicDialog/index.css`:

- Remove `.player-detail-backdrop` from the selector shared with `.debate-topic-backdrop`.
- Remove `.player-detail-modal` from the selector shared with `.debate-topic-dialog`.
- Remove `.player-detail-modal h3` from the selector shared with `.debate-topic-dialog h2`.
- Delete the standalone `.player-detail-*` blocks near the bottom.

In `WerewolfGame/index.css`, delete the contiguous `.player-detail-backdrop` through `.player-detail-modal dd` block.

In `WerewolfGameV2/index.css`, remove only the `.player-detail-*` selectors from the three combined thinking/detail rules, leaving the thinking-modal declarations intact.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run:

```powershell
node --preserve-symlinks --preserve-symlinks-main .\tests\unit\runUnitTests.cjs playerDetailModal.test.ts playerPosterSpotlight.test.ts
```

Expected: all focused tests pass, including the 13 existing cutout asset checks.

- [ ] **Step 6: Update the C-side contract documentation**

Add a concise player-detail paragraph to `docs/project-client.md`:

```markdown
- 各游戏现有“查看玩家详情”入口复用通用人物详情弹窗：基础区显示透明全身人物形象、昵称、性别和性格，立绘失败时回退头像与姓名首字；本局信息只展示调用方已有的非空公开字段。该弹窗不新增游戏入口，不改变席位交互、身份权限、实时/回放数据或服务端规则。
```

- [ ] **Step 7: Run final verification**

Run:

```powershell
pnpm.cmd --filter @ai-presenter/client run check
pnpm.cmd run build:client
pnpm.cmd run test:unit
git diff --check
```

Expected: every command exits `0`. If unrelated existing changes make the full unit suite fail, rerun the focused tests and report the unrelated failure verbatim rather than modifying out-of-scope files.

- [ ] **Step 8: Commit Task 2**

```powershell
git add packages/client/src/features/werewolf/components/WerewolfPlayerDetailModal/index.tsx packages/client/src/features/debate/components/DebateTopicDialog/index.css packages/client/src/features/werewolf/WerewolfGame/index.css packages/client/src/features/werewolf-v2/WerewolfGameV2/index.css tests/unit/playerDetailModal.test.ts docs/project-client.md
git commit -m "refactor(client): unify player detail popups"
```
