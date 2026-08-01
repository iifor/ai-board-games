# Cross-Game Host Cutout and Debate Judge Row Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show an assigned or default host cutout only during host narration in all three v2 games, and keep Debate's four judges on one row.

**Architecture:** Reuse `PlayerPosterSpotlight` and add one shared default-host poster resolver plus one real transparent host asset. Debate and Werewolf consume their existing `SpeechState` and serialized `game.host`; Undercover keeps a client-only sanitized host snapshot and current public narration state because its controller currently discards both. Each v2 arena owns only its placement CSS.

**Tech Stack:** React 18, TypeScript, scoped CSS, Node test runner, ImageGen, WebP

## Global Constraints

- Apply only to `/game/v2/debate`, `/game/v2/werewolf`, and `/game/v2/undercover`; classic routes remain unchanged.
- Do not add REST APIs, database fields, shared protocol fields, WebSocket messages, dependencies, or a new host component.
- Reuse existing host selection in Debate and Werewolf; do not add host selection to Undercover.
- Host cutouts appear only while `speakerRole === 'host'` and playable text is active.
- Player speech always takes precedence over a stale host state.
- Preserve Werewolf player-view visibility and Undercover secret filtering.
- Preserve unrelated worktree changes, especially the existing edits in `DebateGameV2/index.css` and `tests/unit/debateStyle.test.ts`.
- Use a real generated transparent host asset; do not use an icon, CSS drawing, placeholder, or enlarged avatar.
- Follow the approved design in `docs/superpowers/specs/2026-08-01-cross-game-host-cutout-and-debate-judge-row-design.md`.

---

### Task 1: Shared Default Host Asset and Resolver

**Files:**
- Create: `packages/client/public/player-poster-cutouts/host.webp`
- Modify: `packages/client/src/components/PlayerPosterSpotlight/index.tsx:10-72`
- Modify: `packages/client/src/components/PlayerPosterSpotlight/posters.ts:1-67`
- Modify: `tests/unit/playerPosterSpotlight.test.ts:7-73`

**Interfaces:**
- Produces: `DEFAULT_HOST_POSTER: PosterPlayer`
- Produces: `getHostPosterPlayer(value?: unknown): PosterPlayer`
- Produces: `PlayerPosterSpotlight.fallback?: 'initials' | 'none'`
- Produces: `PlayerPosterSpotlight.decorative?: boolean`
- Produces: `/player-poster-cutouts/host.webp`, 1024×1536 with transparency

- [ ] **Step 1: Capture current v2 visual baselines before code changes**

Use `browser:control-in-app-browser` and keep the existing browser choice. Capture desktop screenshots of:

```text
http://localhost:5173/game/v2/debate
http://localhost:5173/game/v2/werewolf
http://localhost:5173/game/v2/undercover
```

Store the screenshots under `C:\tmp\consensus-host-baselines\` with filenames:

```text
debate-before.png
werewolf-before.png
undercover-before.png
```

Expected: all three current v2 stages are visible; no implementation changes have been made.

- [ ] **Step 2: Write the failing shared resolver and asset tests**

Update the asset constants and add the resolver assertions:

```ts
import {
  getHostPosterPlayer,
  resolvePlayerPoster,
} from '../../packages/client/src/components/PlayerPosterSpotlight/posters';

const EXPECTED_CUTOUTS = [
  'chatgpt.webp',
  'claude-code.webp',
  'deepseek.webp',
  'doubao.webp',
  'gemini.webp',
  'grok.webp',
  'host.webp',
  'kimi.webp',
  'meta.webp',
  'qwen.webp',
  'wenxin.webp',
  'xinghuo.webp',
  'yuanbao.webp',
  'zhipu.webp',
];

test('resolves a real default host cutout and preserves assigned host identity', () => {
  const fallback = getHostPosterPlayer();
  assert.equal(fallback.nickname, '主持人');
  assert.equal(fallback.avatar, '/player-poster-cutouts/host.webp');

  const assigned = getHostPosterPlayer({
    id: 7,
    nickname: '千问',
    avatar: '/avatars/qwen.png',
  });
  assert.equal(assigned.id, 7);
  assert.equal(resolvePlayerPoster(assigned, 'cutout'), '/player-poster-cutouts/qwen.webp');
});

test('supports an empty stage instead of initials when a host image fails', () => {
  const component = fs.readFileSync(
    path.join(process.cwd(), 'packages', 'client', 'src', 'components', 'PlayerPosterSpotlight', 'index.tsx'),
    'utf8',
  );
  assert.match(component, /fallback = 'initials'/);
  assert.match(component, /!imageSource && fallback === 'none'/);
  assert.match(component, /aria-hidden=\{decorative \|\| undefined\}/);
});
```

Change the transparent-cutout inventory assertion from `EXPECTED_POSTERS` to `EXPECTED_CUTOUTS`:

```ts
assert.deepEqual(cutoutFiles, EXPECTED_CUTOUTS);
```

- [ ] **Step 3: Run the focused test and verify it fails**

Run:

```powershell
pnpm.cmd test:unit -- playerPosterSpotlight.test.ts
```

Expected: FAIL because `getHostPosterPlayer` and `host.webp` do not exist.

- [ ] **Step 4: Generate the default host source image**

Read and use the `imagegen` skill, then call ImageGen with this exact art direction:

```text
Full-body 3D stylized professional AI game-show host, East Asian appearance, gender-neutral presentation, warm confident expression, elegant charcoal-black tailored formal suit with subtle gold trim and a clean ivory high-collar shirt, relaxed upright pose, one hand holding slim cue cards at waist height, no logos, no text, no podium, no microphone, no scenery, complete figure from head to shoes, centered with generous transparent margin, soft neutral studio key light and restrained gold rim light, polished premium game cinematic character style matching a dark blue and red esports stage, isolated transparent background, vertical 2:3 composition.
```

Save the generated transparent PNG as:

```text
C:\tmp\consensus-host-source.png
```

Inspect it with `view_image`. Reject and regenerate if the feet are cropped, the background is opaque, text/logo artifacts appear, or strong blue/red faction colors dominate.

- [ ] **Step 5: Convert and verify the production WebP**

Run:

```powershell
$hostFfmpeg = (Get-Item -LiteralPath 'C:\Users\Administrator\AppData\Local\Microsoft\WinGet\Links\ffmpeg.exe').Target[0]
$hostFfprobe = Join-Path (Split-Path -Parent $hostFfmpeg) 'ffprobe.exe'
& $hostFfmpeg -y -i 'C:\tmp\consensus-host-source.png' -vf "scale=1024:1536:force_original_aspect_ratio=decrease,pad=1024:1536:(ow-iw)/2:(oh-ih)/2:color=0x00000000" -c:v libwebp -quality 86 -compression_level 6 -pix_fmt yuva420p 'packages\client\public\player-poster-cutouts\host.webp'
& $hostFfprobe -v error -select_streams v:0 -show_entries stream=width,height,pix_fmt -of default=noprint_wrappers=1 'packages\client\public\player-poster-cutouts\host.webp'
```

Expected:

```text
width=1024
height=1536
```

The reported pixel format must include alpha support. Inspect the WebP with `view_image` once more.

- [ ] **Step 6: Implement the minimum shared resolver**

Add after `PosterPlayer`:

```ts
export const DEFAULT_HOST_POSTER: PosterPlayer = {
  id: 'default-host',
  nickname: '主持人',
  avatar: '/player-poster-cutouts/host.webp',
};
```

Add before `normalizePlayerAlias`:

```ts
export function getHostPosterPlayer(value?: unknown): PosterPlayer {
  if (!value || typeof value !== 'object') return DEFAULT_HOST_POSTER;
  const host = value as PosterPlayer;
  return {
    ...host,
    id: host.id ?? DEFAULT_HOST_POSTER.id,
    nickname: host.nickname || host.name || DEFAULT_HOST_POSTER.nickname,
    avatar:
      host.avatar
      || host.avatarUrl
      || host.avatar_url
      || DEFAULT_HOST_POSTER.avatar,
  };
}
```

Do not add `host` to `POSTER_SLUG_BY_ALIAS`: the default host uses its explicit asset path, while an assigned known player still resolves to that player's existing cutout.

- [ ] **Step 7: Add the opt-in empty fallback**

Extend the props and function parameters:

```ts
interface PlayerPosterSpotlightProps {
  player?: PosterPlayer | null;
  className?: string;
  variant?: PlayerPosterVariant;
  fallback?: 'initials' | 'none';
  decorative?: boolean;
}

export function PlayerPosterSpotlight({
  player,
  className = '',
  variant = 'poster',
  fallback = 'initials',
  decorative = false,
}: PlayerPosterSpotlightProps) {
```

Replace the current null guard with:

```ts
if (!player || (!imageSource && fallback === 'none')) return null;
```

The default remains `initials`, so every existing player call keeps its current fallback behavior.

Make host artwork decorative while keeping existing player announcements:

```tsx
<aside
  className={`player-poster-spotlight${className ? ` ${className}` : ''}`}
  aria-hidden={decorative || undefined}
  aria-label={decorative ? undefined : `${playerName}正在发言`}
  aria-live={decorative ? undefined : 'polite'}
>
```

- [ ] **Step 8: Run the focused test and verify it passes**

Run:

```powershell
pnpm.cmd test:unit -- playerPosterSpotlight.test.ts
```

Expected: PASS, including the exact 14-file cutout inventory.

- [ ] **Step 9: Commit**

```powershell
git add -- 'packages/client/public/player-poster-cutouts/host.webp' 'packages/client/src/components/PlayerPosterSpotlight/index.tsx' 'packages/client/src/components/PlayerPosterSpotlight/posters.ts' 'tests/unit/playerPosterSpotlight.test.ts'
git commit -m "feat: add shared default host cutout"
```

---

### Task 2: Debate Host Cutout and Single-Row Judges

**Files:**
- Modify: `packages/client/src/features/debate/components/DebateArena/index.tsx:1-106`
- Modify: `packages/client/src/features/debate-v2/DebateGameV2/index.css:428-509`
- Modify: `tests/unit/debateStyle.test.ts:1-32`

**Interfaces:**
- Consumes: `getHostPosterPlayer(value?: unknown): PosterPlayer`
- Consumes: existing `subtitleSpeech?: SpeechState | null`
- Produces: `spotlightPlayer` that is either the current player, current host, or `null`

- [ ] **Step 1: Add failing Debate host and judge-layout assertions**

Extend `uses the approved cutout speaker and debate stage hooks`:

```ts
assert.match(arena, /getHostPosterPlayer/);
assert.match(arena, /subtitleSpeech\?\.speakerRole === 'host'/);
assert.match(arena, /const spotlightPlayer = currentSpeaker \|\|/);
```

Add a focused layout test:

```ts
test('keeps four debate judges in one responsive v2 row', () => {
  const arenaCss = read('packages/client/src/features/debate-v2/DebateGameV2/index.css');

  assert.match(
    arenaCss,
    /\.debate-shell--v2 \.judge-row\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\);/,
  );
  assert.match(
    arenaCss,
    /\.debate-shell--v2 \.judge-row \.debate-seat\.judge\s*\{[\s\S]*?width:\s*100%;[\s\S]*?min-width:\s*0;/,
  );
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
pnpm.cmd test:unit -- debateStyle.test.ts
```

Expected: FAIL because the arena has no host fallback and the judge row still wraps at 520px.

- [ ] **Step 3: Make the Debate stage speaker switch mutually exclusive**

Update the import:

```ts
import { PlayerPosterSpotlight } from '../../../../components/PlayerPosterSpotlight';
import { getHostPosterPlayer } from '../../../../components/PlayerPosterSpotlight/posters';
```

After `currentSpeaker`, add:

```ts
const hostSpeaking = showPlayerPoster
  && subtitleSpeech?.speakerRole === 'host'
  && Boolean(subtitleSpeech.text);
const spotlightPlayer = currentSpeaker || (
  hostSpeaking ? getHostPosterPlayer(game.host) : null
);
```

Replace the existing spotlight condition and player:

```tsx
{showPlayerPoster && spotlightPlayer && (
  <PlayerPosterSpotlight
    className="debate-speaker-spotlight"
    key={spotlightPlayer.id}
    player={spotlightPlayer}
    variant="cutout"
    fallback={hostSpeaking && !currentSpeaker ? 'none' : 'initials'}
    decorative={hostSpeaking && !currentSpeaker}
  />
)}
```

This keeps classic Debate unchanged and makes a real player take precedence over stale host narration.

- [ ] **Step 4: Make four judge cards one row**

Replace the scoped v2 judge layout with:

```css
.debate-shell--v2 .judge-row {
  z-index: 12;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  width: min(100%, 660px);
  margin: 6px 0 0;
  gap: 8px;
  overflow-x: auto;
}

.debate-shell--v2 .judge-row .debate-seat.judge {
  width: 100%;
  min-width: 0;
  min-height: 58px;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid rgba(197, 164, 242, 0.24);
  border-radius: 8px;
  background: rgba(16, 13, 22, 0.7);
}
```

Inside the existing `@media (max-width: 980px)` block add:

```css
.debate-shell--v2 .judge-row {
  grid-template-columns: repeat(4, minmax(126px, 1fr));
  justify-self: stretch;
}
```

Keep the existing nickname/model ellipsis rules and all unrelated roster-rail edits intact.

- [ ] **Step 5: Run the focused tests and client type check**

Run:

```powershell
pnpm.cmd test:unit -- debateStyle.test.ts playerPosterSpotlight.test.ts
pnpm.cmd --filter @ai-presenter/client run check
```

Expected: both test files PASS and TypeScript exits 0.

- [ ] **Step 6: Commit**

```powershell
git add -- 'packages/client/src/features/debate/components/DebateArena/index.tsx' 'packages/client/src/features/debate-v2/DebateGameV2/index.css' 'tests/unit/debateStyle.test.ts'
git commit -m "feat: show debate host and align judges"
```

---

### Task 3: Werewolf v2 Host Cutout

**Files:**
- Modify: `packages/client/src/features/werewolf/hooks/useWerewolfSpeechPlayback.ts:16-20`
- Modify: `packages/client/src/features/werewolf-v2/components/WerewolfArenaV2/index.tsx:1-40`
- Modify: `tests/unit/playerPosterSpotlight.test.ts:75-121`

**Interfaces:**
- Consumes: `getHostPosterPlayer(value?: unknown): PosterPlayer`
- Consumes: existing `props.activeSpeech: SpeechState | null`
- Produces: `SpeechState.speakerRole` and `SpeechState.speakerLabel` copied from the existing subtitle

- [ ] **Step 1: Add failing Werewolf wiring assertions**

Extend `scopes poster spotlight wiring to v2 game routes`:

```ts
const werewolfPlayback = read('packages/client/src/features/werewolf/hooks/useWerewolfSpeechPlayback.ts');

assert.match(werewolfPlayback, /speakerRole:\s*event\?\.subtitle\?\.speakerRole \|\| ''/);
assert.match(werewolfArena, /const hostSpeaking = props\.activeSpeech\?\.speakerRole === 'host'/);
assert.match(werewolfArena, /getHostPosterPlayer\(props\.game\.host\)/);
assert.match(werewolfArena, /data-speech-active=\{foregroundSpeech \|\| hostSpeaking/);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
pnpm.cmd test:unit -- playerPosterSpotlight.test.ts
```

Expected: FAIL because Werewolf drops subtitle speaker metadata and renders only player IDs.

- [ ] **Step 3: Preserve existing host speaker metadata**

Update `getWerewolfExtraFields`:

```ts
function getWerewolfExtraFields(event: GameEvent, text: string): Partial<SpeechState> {
  return {
    speakerLabel: event?.subtitle?.speakerLabel || '',
    speakerRole: event?.subtitle?.speakerRole || '',
    fullText: event?.speech?.fullText || event?.testimony?.fullText || text,
    thinking: event?.speech?.thinking || event?.testimony?.thinking || '',
  };
}
```

- [ ] **Step 4: Reuse the existing Werewolf speaker slot**

Import the resolver:

```ts
import { getHostPosterPlayer } from '../../../../components/PlayerPosterSpotlight/posters';
```

Replace the speaker derivation with:

```ts
const foregroundSpeech = props.activeSpeech?.playerId == null ? null : props.activeSpeech;
const speakingPlayer = foregroundSpeech?.playerId == null
  ? null
  : players.find((player) => Number(player.id) === Number(foregroundSpeech.playerId)) || null;
const hostSpeaking = props.activeSpeech?.speakerRole === 'host' && Boolean(props.activeSpeech.text);
const spotlightPlayer = speakingPlayer || (
  hostSpeaking ? getHostPosterPlayer(props.game.host) : null
);
```

Update the section state and spotlight:

```tsx
<section
  className="werewolf-v2-arena"
  data-completed={props.game.winner ? 'true' : 'false'}
  data-phase={phase}
  data-speech-active={foregroundSpeech || hostSpeaking ? 'true' : 'false'}
>
  <div className="werewolf-v2-background" aria-hidden="true"><i className="is-night" /><i className="is-day" /></div>
  {spotlightPlayer && (
    <PlayerPosterSpotlight
      key={spotlightPlayer.id}
      player={spotlightPlayer}
      className="werewolf-v2-speaker-backdrop"
      variant="cutout"
      fallback={hostSpeaking && !speakingPlayer ? 'none' : 'initials'}
      decorative={hostSpeaking && !speakingPlayer}
    />
  )}
```

Keep `WerewolfBottomSpeechBar` limited to `foregroundSpeech`; host narration continues using its existing label/audio path.

- [ ] **Step 5: Run focused tests and type check**

Run:

```powershell
pnpm.cmd test:unit -- playerPosterSpotlight.test.ts werewolfClientDisplayState.test.ts werewolfPresentationProjection.test.ts
pnpm.cmd --filter @ai-presenter/client run check
```

Expected: all tests PASS and TypeScript exits 0.

- [ ] **Step 6: Commit**

```powershell
git add -- 'packages/client/src/features/werewolf/hooks/useWerewolfSpeechPlayback.ts' 'packages/client/src/features/werewolf-v2/components/WerewolfArenaV2/index.tsx' 'tests/unit/playerPosterSpotlight.test.ts'
git commit -m "feat: show host cutout in werewolf v2"
```

---

### Task 4: Undercover v2 Host Narration State and Cutout

**Files:**
- Modify: `packages/client/src/features/undercover/types.ts:1-10`
- Modify: `packages/client/src/features/undercover/hooks/useUndercoverGame.ts:7-175`
- Modify: `packages/client/src/features/undercover/UndercoverGame/index.tsx:13-53`
- Modify: `packages/client/src/features/undercover/components/UndercoverArena.tsx:1-180`
- Modify: `packages/client/src/features/undercover/components/UndercoverArena.css:293-415`
- Modify: `tests/unit/undercoverClient.test.ts:39-176`

**Interfaces:**
- Produces: `UndercoverHost` with public identity fields only
- Produces: `UndercoverViewState.host: UndercoverHost | null`
- Produces: `UndercoverViewState.activeSpeech: SpeechState | null`
- Consumes: `getHostPosterPlayer(value?: unknown): PosterPlayer`

- [ ] **Step 1: Add failing reducer and rendered-stage tests**

Add a host-render test:

```ts
test('Undercover v2 swaps the player poster for a host cutout only during host narration', () => {
  const markup = renderToStaticMarkup(createElement(undercoverComponents.UndercoverArena, {
    game: { ...speakingGame(1), status: 'voting' },
    variant: 'v2',
    host: { id: 0, nickname: '主持人' },
    activeSpeech: {
      id: 'host-1',
      playerId: null,
      text: '请开始投票。',
      speakerRole: 'host',
    },
  }));

  assert.match(markup, /undercover-host-poster/);
  assert.match(markup, /player-poster-cutouts\/host\.webp/);
});
```

Add a reducer privacy test:

```ts
test('Undercover retains only public host identity and host narration state', () => {
  const feature = require('../../packages/client/src/features/undercover/hooks/useUndercoverGame') as typeof import('../../packages/client/src/features/undercover/hooks/useUndercoverGame');
  const state = feature.reduceUndercoverViewState(feature.EMPTY_UNDERCOVER_VIEW_STATE, {
    type: 'undercover-round-start',
    ackId: 9,
    subtitle: { text: '第一轮开始。', speakerRole: 'host', speakerLabel: '主持人' },
    game: {
      id: 'undercover-host',
      gameType: 'undercover',
      mode: 'standard-6',
      status: 'speaking',
      round: 1,
      players: [],
      speeches: [],
      host: {
        id: 0,
        nickname: '主持人',
        avatar: '',
        secretPrompt: 'must-not-leak',
      },
    },
  });

  assert.equal(state.activeSpeech?.speakerRole, 'host');
  assert.equal(state.activeSpeech?.text, '第一轮开始。');
  assert.equal(state.host?.nickname, '主持人');
  assert.equal('secretPrompt' in (state.host || {}), false);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
pnpm.cmd test:unit -- undercoverClient.test.ts
```

Expected: FAIL because `UndercoverViewState` does not retain host identity or narration state and the arena has no host props.

- [ ] **Step 3: Add client-only Undercover host types**

Update `types.ts`:

```ts
import type { SpeechState } from '../../types';
import type { UndercoverPublicState, UndercoverVoteResult } from '@ai-presenter/shared/types/undercover';

export interface UndercoverHost {
  id?: string | number;
  name?: string;
  nickname?: string;
  avatar?: string;
  avatarUrl?: string;
}

export interface UndercoverViewState {
  game: UndercoverPublicState | null;
  host: UndercoverHost | null;
  activeSpeech: SpeechState | null;
  error: string;
  message: string;
}
```

This is a client feature type only; do not modify `packages/shared/types/undercover.ts`.

- [ ] **Step 4: Project only public host identity and current speaker metadata**

Update the hook's type imports:

```ts
import type { GameEvent, QueueItem, SpeechState } from '../../../types';
import type {
  UndercoverHost,
  UndercoverPublicState,
  UndercoverStartOptions,
  UndercoverViewState,
  UndercoverVoteResult,
} from '../types';
```

Extend `EMPTY_UNDERCOVER_VIEW_STATE`:

```ts
export const EMPTY_UNDERCOVER_VIEW_STATE: UndercoverViewState = {
  game: null,
  host: null,
  activeSpeech: null,
  error: '',
  message: '已选择 6 位 AI 玩家，点击开始游戏。',
};
```

Add:

```ts
function projectUndercoverHost(value: unknown): UndercoverHost | null {
  if (!value || typeof value !== 'object') return null;
  const host = value as Record<string, unknown>;
  return {
    id: host.id as string | number | undefined,
    name: String(host.name || ''),
    nickname: String(host.nickname || host.name || '主持人'),
    avatar: String(host.avatar || ''),
    avatarUrl: String(host.avatarUrl || host.avatar || ''),
  };
}

function getUndercoverActiveSpeech(event: GameEvent): SpeechState | null {
  const text = String(event.subtitle?.text || '').trim();
  const speakerRole = String(event.subtitle?.speakerRole || '').trim();
  if (!text || !speakerRole) return null;
  return {
    id: `${event.ackId || event.type}-undercover`,
    playerId: event.speech?.playerId || null,
    text,
    speakerLabel: event.subtitle?.speakerLabel || '',
    speakerRole,
    wordBoundaries: event.wordBoundaries || null,
  };
}
```

In the successful reducer return, add:

```ts
host: projectUndercoverHost(event.game.host) || state.host,
activeSpeech: getUndercoverActiveSpeech(event),
```

Clear stale narration in the reducer's error branch:

```ts
return { ...state, activeSpeech: null, error: message, message };
```

Also make narration prefer the server-prepared subtitle:

```ts
export function getUndercoverNarration(event: GameEvent): string {
  return String(
    event.subtitle?.text
    || event.presentation?.speakableText
    || event.speech?.text
    || event.message
    || '',
  );
}
```

- [ ] **Step 5: Clear the active narration at the existing lifecycle boundaries**

Change the callbacks:

```ts
onAcknowledge: () => {
  setView((current) => ({ ...current, activeSpeech: null }));
},
onSkipPhase: (message) => {
  setView((current) => ({
    ...current,
    activeSpeech: null,
    message: message || '正在跳过当前阶段...',
  }));
},
onAutoPlayStopped: () => {
  setView((current) => ({ ...current, activeSpeech: null }));
},
```

In `stopGame`, add:

```ts
setView((current) => ({ ...current, activeSpeech: null }));
```

- [ ] **Step 6: Pass the existing controller state to the arena**

Update `UndercoverGame`:

```tsx
<UndercoverArena
  game={controller.game}
  host={controller.host}
  activeSpeech={controller.activeSpeech}
  showPlayerPoster={variant === 'v2'}
/>
```

- [ ] **Step 7: Render a mutually exclusive v2 host cutout**

Update imports and props:

```ts
import { getHostPosterPlayer } from '../../../components/PlayerPosterSpotlight/posters';
import type { SpeechState } from '../../../types';
import type { UndercoverHost, UndercoverPublicState } from '../types';

interface UndercoverArenaProps {
  game: UndercoverPublicState;
  host?: UndercoverHost | null;
  activeSpeech?: SpeechState | null;
  variant?: 'classic' | 'v2';
  showPlayerPoster?: boolean;
}
```

Inside `UndercoverArena`, add:

```ts
const hostSpeaking = activeSpeech?.speakerRole === 'host' && Boolean(activeSpeech.text);
const spotlightPlayer = hostSpeaking ? getHostPosterPlayer(host) : view.currentPlayer;
```

Use:

```tsx
{spotlightPlayer && (
  <PlayerPosterSpotlight
    key={spotlightPlayer.id}
    player={spotlightPlayer}
    className={hostSpeaking
      ? 'undercover-speaker-poster undercover-host-poster'
      : 'undercover-speaker-poster'}
    variant={hostSpeaking ? 'cutout' : 'poster'}
    fallback={hostSpeaking ? 'none' : 'initials'}
    decorative={hostSpeaking}
  />
)}
```

The classic return occurs earlier and remains unchanged.

- [ ] **Step 8: Place the Undercover host behind the focus panel**

Add:

```css
.undercover-stage--v2 > .undercover-host-poster {
  z-index: 2;
  pointer-events: none;
}

.undercover-stage--v2 .undercover-host-poster .player-poster-spotlight__card.is-cutout {
  position: absolute;
  inset: 9% 30% 22%;
  width: auto;
  height: auto;
  max-height: none;
  border: 0;
  background: transparent;
  box-shadow: none;
  transform: none;
}

.undercover-stage--v2 .undercover-host-poster .player-poster-spotlight__portrait {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center bottom;
  filter: drop-shadow(0 20px 24px rgba(0, 0, 0, 0.42));
}
```

The shared `PlayerPosterSpotlight` already provides the short entrance animation and disables it under `prefers-reduced-motion`; do not duplicate animation rules in Undercover.

- [ ] **Step 9: Run focused tests and type check**

Run:

```powershell
pnpm.cmd test:unit -- undercoverClient.test.ts playerPosterSpotlight.test.ts undercoverVisibility.test.ts
pnpm.cmd --filter @ai-presenter/client run check
```

Expected: all tests PASS, no secret-field assertion fails, and TypeScript exits 0.

- [ ] **Step 10: Commit**

```powershell
git add -- 'packages/client/src/features/undercover/types.ts' 'packages/client/src/features/undercover/hooks/useUndercoverGame.ts' 'packages/client/src/features/undercover/UndercoverGame/index.tsx' 'packages/client/src/features/undercover/components/UndercoverArena.tsx' 'packages/client/src/features/undercover/components/UndercoverArena.css' 'tests/unit/undercoverClient.test.ts'
git commit -m "feat: show host cutout in undercover v2"
```

---

### Task 5: Documentation, Full Verification, and Visual QA

**Files:**
- Modify: `docs/project-client.md:244-252`
- Modify only if the implementation requires correcting the approved contract: `docs/superpowers/specs/2026-08-01-cross-game-host-cutout-and-debate-judge-row-design.md`
- Test: `tests/unit/playerPosterSpotlight.test.ts`
- Test: `tests/unit/debateStyle.test.ts`
- Test: `tests/unit/undercoverClient.test.ts`

**Interfaces:**
- Consumes: completed host cutout behavior from Tasks 1-4
- Produces: documented v2 presentation contract and screenshot evidence

- [ ] **Step 1: Update the client architecture document**

Replace the `v2 玩家发言海报` wording that limits the component to players with:

```md
### v2 玩家与主持人立绘

- `components/PlayerPosterSpotlight` 是辩论、狼人杀、谁是卧底三种 v2 舞台共用的纯展示组件；当前公开玩家发言匹配玩家立绘，主持播报匹配已选主持人或统一默认主持人立绘，v1 路由不启用。
- 默认主持人使用 `/player-poster-cutouts/host.webp`；辩论赛和狼人杀已选择 AI 主持人时优先复用该玩家透明立绘，谁是卧底继续使用默认主持人。
- 主持人只在现有字幕元数据标记 `speakerRole=host` 且存在可播放文本时出现；玩家发言、系统播报、等待和播放结束状态不显示主持人。
- 立绘层位于舞台背景之上、席位与字幕等业务 UI 之下，不拦截操作；减少动态效果偏好下关闭入场动画。
- 该能力只消费现有前端公开主持人、玩家和播放状态，不新增 REST API、WebSocket 消息、TTS/ACK 队列或 shared 协议字段。
```

Keep the existing game-specific placement notes immediately below it.

- [ ] **Step 2: Run all unit tests**

Run:

```powershell
pnpm.cmd test:unit
```

Expected: the full unit suite passes with 0 failures.

- [ ] **Step 3: Run static checks and the production client build**

Run:

```powershell
pnpm.cmd --filter @ai-presenter/client run check
pnpm.cmd run build:client
```

Expected: both commands exit 0.

- [ ] **Step 4: Verify Debate v2 in the in-app browser**

Open:

```text
http://localhost:5173/game/v2/debate
```

Verify:

```text
1. Four judges remain on one row.
2. No judge section is reserved when no judges are assigned.
3. Default-host narration shows host.webp.
4. Assigned-host narration shows that player's cutout.
5. Player speech replaces the host immediately.
6. Topic, phase panel, judge cards, and subtitle do not overlap the cutout.
```

Capture `C:\tmp\consensus-host-baselines\debate-after.png`.

- [ ] **Step 5: Verify Werewolf v2 in both view modes**

Open:

```text
http://localhost:5173/game/v2/werewolf
```

Verify in god view and player view:

```text
1. Host narration shows the default or selected-host cutout in the existing speaker slot.
2. Player speech replaces the host.
3. Day/night backgrounds still switch.
4. The player view reveals no role, night action, or private cue because of the host display.
5. Host completion clears the cutout.
```

Capture `C:\tmp\consensus-host-baselines\werewolf-after.png`.

- [ ] **Step 6: Verify Undercover v2 public-state safety**

Open:

```text
http://localhost:5173/game/v2/undercover
```

Verify:

```text
1. Opening/round/vote host narration shows host.webp behind the focus panel.
2. Player description replaces the host with the existing player poster.
3. No word pair, undercover identity, legal target list, or individual ballot appears before completion.
4. Six seats, phase heading, vote summary, and focus panel do not overlap the host's face.
5. Host completion clears the cutout.
```

Capture `C:\tmp\consensus-host-baselines\undercover-after.png`.

- [ ] **Step 7: Compare reference and implementation screenshots**

Create three side-by-side comparisons using each `before` and `after` screenshot at identical viewport dimensions. Also compare the user-provided Debate reference:

```text
C:\Users\Administrator\AppData\Local\Temp\codex-clipboard-7be0f539-5199-49b7-9a5d-1e087a13e09a.png
```

Inspect each comparison for:

```text
cropping
opaque image edges
broken transparency
card wrapping
text overflow
incorrect z-index
subtitle overlap
host/player overlap
wrong border radius
unexpected classic-route changes
```

Fix only observed issues, rerun the focused test for the changed game, and recapture the affected screenshot.

- [ ] **Step 8: Review the final diff**

Run:

```powershell
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors; only planned files plus the user's pre-existing unrelated changes are present.

- [ ] **Step 9: Commit documentation and verified visual adjustments**

```powershell
git add -- 'docs/project-client.md'
git commit -m "docs: document v2 host cutout behavior"
```

Do not stage `design-qa.md`, the older Debate style plan, or any unrelated pre-existing worktree changes.
