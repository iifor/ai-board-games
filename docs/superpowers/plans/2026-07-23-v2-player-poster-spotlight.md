# v2 Player Poster Spotlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate 13 player posters and show the correct poster during player speech on the v2 debate, werewolf, and undercover screens without changing playback or server protocols.

**Architecture:** A shared client component receives the already-resolved current player, maps the player's configured name to a static poster, and renders one image as both a blurred atmosphere layer and a sharp 4:5 card. Each v2 game supplies its existing public speaker state; classic routes remain unchanged through explicit v2 guards.

**Tech Stack:** React 18, TypeScript, scoped CSS, built-in `image_gen`, bundled Python Pillow for WebP conversion, Node test runner.

## Global Constraints

- Cover only `/game/v2/debate`, `/game/v2/werewolf`, and `/game/v2/undercover`.
- Do not change WebSocket events, TTS, ACK, REST API, database, or shared protocol types.
- Generate posters for 豆包, Grok, 文心一言, Gemini, Kimi, DeepSeek, 千问, 元宝, 讯飞星火, 智谱清言, ChatGPT, Claude Code, and Meta.
- Posters are text-free 4:5 portraits in the approved polished soft 3D chibi style; no corporate logos, trademarks, weapons, watermarks, or extra people.
- Preserve subtitles, seats, phase information, controls, and werewolf hidden-information boundaries.
- A missing or failed poster falls back to the configured avatar, then to the existing UI with a name-only spotlight.
- Use the existing character sheets as identity references; do not redesign the characters.
- Do not add a dependency.

---

### Task 1: Generate and optimize the 13 poster assets

**Files:**
- Create: `artifacts/player-posters/*.png`
- Create: `packages/client/public/player-posters/*.webp`

**Interfaces:**
- Consumes: the approved character sheets and the prompt matrix below.
- Produces: one `1600x2000` WebP-compatible 4:5 source per player, addressed by stable slug.

- [ ] **Step 1: Generate one poster per player**

Make one built-in `image_gen` call per row. Use the referenced character sheet as Image 1 and replace the labeled values in this exact prompt with the row values:

```text
Use case: stylized-concept
Asset type: premium game broadcast player poster
Input images: Image 1 is the identity, face, hair, outfit, color, emblem, and 3D rendering reference. Preserve the same character; do not copy the turnaround-sheet layout or labels.
Primary request: create a text-free cinematic 4:5 portrait poster for <PLAYER>, expressing <PERSONALITY>.
Scene/backdrop: deep <PALETTE> cinematic gradient with subtle abstract particles, soft rim light, and generous clean separation behind the subject.
Subject: the same character from Image 1, framed from mid-thigh upward, facing camera in a confident neutral hero pose; preserve <IDENTITY LOCK>.
Style/medium: polished soft 3D chibi animation render, premium game broadcast key art, detailed fabric, clean silhouette.
Composition/framing: vertical 4:5; centered subject; head and shoulders clear; safe margins for responsive cropping; no typography area required.
Lighting/mood: controlled studio key light plus color-matched rim light; personality-led but not theatrical.
Constraints: exactly one character; preserve identity and outfit; no text, letters, numbers, logos, trademarks, weapons, watermark, UI, frame, or extra people.
```

| Slug | Player | Personality | Palette | Identity lock | Reference image |
| --- | --- | --- | --- | --- | --- |
| `doubao` | 豆包 | warm energetic sincerity | sage green and warm cream | short dark-brown bob, sage hoodie, dark shorts, cheerful bean emblem | `C:/Users/Administrator/Desktop/AI角色/豆包/豆包-三视图.png` |
| `grok` | Grok | rebellious sharp-tongued confidence | black, charcoal, and dark red | messy black hair, black-red jacket, distressed jeans, lightning-crack emblem | `.worktrees/ai-player-character-sheets/artifacts/player-character-sheets/grok-character-sheet.png` |
| `wenxin` | 文心一言 | warm old-school courtesy | ivory, dark teal, and jade | tied-back dark-brown hair, modern Chinese long jacket, bamboo-cloud pattern | `.worktrees/ai-player-character-sheets/artifacts/player-character-sheets/wenxin-character-sheet.png` |
| `gemini` | Gemini | elegant scientific restraint | white, cobalt, and silver | silver-gray hair, blue-white lab coat, twin-star orbital emblem | `.worktrees/ai-player-character-sheets/artifacts/player-character-sheets/gemini-character-sheet.png` |
| `kimi` | Kimi | quiet patient observation | navy, moon white, and graphite | blue-black hair, navy turtleneck, moon-white coat, crescent-page emblem | `.worktrees/ai-player-character-sheets/artifacts/player-character-sheets/kimi-character-sheet.png` |
| `deepseek` | DeepSeek | cold incisive logic | deep ocean blue and black | deep-blue hair, utility jacket, cargo trousers, sonar emblem | `.worktrees/ai-player-character-sheets/artifacts/player-character-sheets/deepseek-character-sheet.png` |
| `qwen` | 千问 | assertive strategic control | black and royal purple | high black-purple ponytail, cropped jacket, question-grid emblem | `.worktrees/ai-player-character-sheets/artifacts/player-character-sheets/qwen-character-sheet.png` |
| `yuanbao` | 元宝 | smiling merchant cleverness | golden orange and dark green | twin buns, modern Chinese jacket, green skirt, coin-ingot pattern | `.worktrees/ai-player-character-sheets/artifacts/player-character-sheets/yuanbao-character-sheet.png` |
| `xinghuo` | 讯飞星火 | bright passionate inspiration | orange red and warm white | red-brown high ponytail, athletic hoodie, flame-soundwave emblem | `.worktrees/ai-player-character-sheets/artifacts/player-character-sheets/xinghuo-character-sheet.png` |
| `zhipu` | 智谱清言 | precise academic composure | gray purple and white | gray-purple bob, glasses, academy blazer, coordinate-grid emblem | `.worktrees/ai-player-character-sheets/artifacts/player-character-sheets/zhipu-character-sheet.png` |
| `chatgpt` | ChatGPT | warm balanced mediation | teal, cream, and beige | chestnut curls, knitted cardigan, dialogue-knot emblem | `.worktrees/ai-player-character-sheets/artifacts/player-character-sheets/chatgpt-character-sheet.png` |
| `claude-code` | Claude Code | reliable exacting focus | cream, orange, and black | short flaxen-blonde hair, programmer utility jacket, paired-bracket emblem | `.worktrees/ai-player-character-sheets/artifacts/player-character-sheets/claude-code-character-sheet.png` |
| `meta` | Meta | free-spirited open collaboration | indigo and khaki | dark-brown curls, light stubble, outdoor jacket, open-loop emblem | `.worktrees/ai-player-character-sheets/artifacts/player-character-sheets/meta-character-sheet.png` |

- [ ] **Step 2: Save and visually inspect every PNG**

Copy each built-in output into `artifacts/player-posters/<slug>.png`. Open each file with `view_image` and reject only objective failures: wrong identity or sex, changed outfit, cropped head, unreadable silhouette, extra person, text, logo, watermark, or non-4:5 composition. Targeted retries use `<slug>-v2.png`; accepted files retain the base filename.

- [ ] **Step 3: Convert accepted sources to client WebP files**

Use the bundled Python executable and Pillow; resize with high-quality Lanczos to `1600x2000`, preserve aspect by centered crop only when necessary, and save WebP at quality 88:

```powershell
& 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' `
  'scripts\build_player_posters.py' `
  'artifacts\player-posters' `
  'packages\client\public\player-posters'
```

Create `scripts/build_player_posters.py` as the smallest deterministic converter: iterate the 13 approved slugs, decode each PNG, apply `ImageOps.fit(image, (1600, 2000), Image.Resampling.LANCZOS)`, and save `<slug>.webp` with `format='WEBP', quality=88, method=6`. Raise on a missing or unreadable source.

- [ ] **Step 4: Verify the asset set**

Run the converter twice and confirm it exits `0` both times. Verify exactly 13 non-empty PNGs and 13 non-empty WebPs, and decode every WebP to assert `1600x2000`.

### Task 2: Add the poster resolver and shared spotlight component

**Files:**
- Create: `packages/client/src/components/PlayerPosterSpotlight/posters.ts`
- Create: `packages/client/src/components/PlayerPosterSpotlight/index.tsx`
- Create: `packages/client/src/components/PlayerPosterSpotlight/index.css`
- Create: `tests/unit/playerPosterSpotlight.test.ts`
- Modify: `tests/unit/runUnitTests.cjs`

**Interfaces:**
- Produces: `resolvePlayerPoster(player: PosterPlayer | null | undefined): string | null`.
- Produces: `PlayerPosterSpotlight({ player, className? })`.
- Consumes: structural player fields `id`, `nickname`, optional `name`, optional `avatar`.

- [ ] **Step 1: Write the failing resolver and component contract tests**

Test all 13 configured names, whitespace/case normalization for Latin names, unknown-player `null`, and source-level component invariants:

```ts
test('poster resolver maps configured players and rejects unknown names', () => {
  assert.equal(resolvePlayerPoster({ id: 1, nickname: '豆包' }), '/player-posters/doubao.webp');
  assert.equal(resolvePlayerPoster({ id: 2, nickname: '  ChatGPT  ' }), '/player-posters/chatgpt.webp');
  assert.equal(resolvePlayerPoster({ id: 3, nickname: 'CLAUDE CODE' }), '/player-posters/claude-code.webp');
  assert.equal(resolvePlayerPoster({ id: 99, nickname: '未知玩家' }), null);
});
```

Read `index.tsx` and assert it contains `aria-live="polite"`, visible `正在发言`, `onError`, and both `player-poster-spotlight__backdrop` and `player-poster-spotlight__card` classes. Add the test filename to the explicit `runUnitTests.cjs` list.

- [ ] **Step 2: Run the focused test and confirm failure**

Run:

```powershell
pnpm.cmd run test:unit -- tests/unit/playerPosterSpotlight.test.ts
```

Expected: FAIL because the resolver/component files do not exist.

- [ ] **Step 3: Implement the minimal resolver**

Use one `Record<string, string>` containing the 13 normalized display names. Normalize with `String(value || '').trim().toLocaleLowerCase('zh-CN')`; prefer `nickname`, then `name`. Return `/player-posters/<slug>.webp` or `null`.

- [ ] **Step 4: Implement the shared component and styles**

The component always renders the accessible player name when `player` exists. Maintain one image source state initialized from poster, then avatar, then empty; on image failure advance once to avatar and finally to name-only rendering. Render the same source in two decorative images: blurred backdrop and sharp card. Use a 220ms opacity/transform transition and disable transform/animation in `@media (prefers-reduced-motion: reduce)`.

- [ ] **Step 5: Run the focused test**

Run the same focused command. Expected: all tests in `playerPosterSpotlight.test.ts` PASS.

### Task 3: Integrate the spotlight into the three v2 screens

**Files:**
- Modify: `packages/client/src/features/debate/DebateGame/index.tsx`
- Modify: `packages/client/src/features/debate/components/DebateArena/index.tsx`
- Modify: `packages/client/src/features/debate-v2/DebateGameV2/index.css`
- Modify: `packages/client/src/features/werewolf-v2/components/WerewolfArenaV2/index.tsx`
- Modify: `packages/client/src/features/werewolf-v2/components/WerewolfArenaV2/index.css`
- Modify: `packages/client/src/App.tsx`
- Modify: `packages/client/src/features/undercover/UndercoverGame/index.tsx`
- Modify: `packages/client/src/features/undercover/components/UndercoverArena.tsx`
- Modify: `packages/client/src/features/undercover/components/UndercoverArena.css`
- Modify: `tests/unit/playerPosterSpotlight.test.ts`

**Interfaces:**
- Consumes: `PlayerPosterSpotlight` and existing public/current speaker state.
- Produces: v2-only poster rendering; classic routes remain poster-free.

- [ ] **Step 1: Extend the failing integration assertions**

Assert the source wiring contains:

```ts
assert.match(debateGame, /showPlayerPoster=\{variant === 'v2'\}/);
assert.match(werewolfV2, /<PlayerPosterSpotlight/);
assert.match(app, /variant=\{route\.version === 'v2' \? 'v2' : 'classic'\}/);
assert.match(undercoverGame, /showPlayerPoster=\{variant === 'v2'\}/);
```

Also assert classic debate defaults `variant = 'classic'` and Undercover defaults `variant = 'classic'`.

- [ ] **Step 2: Run the focused test and confirm failure**

Expected: FAIL on missing v2 wiring.

- [ ] **Step 3: Integrate debate behind the existing variant**

Pass `showPlayerPoster={variant === 'v2'}` into `DebateArena`. In the arena, resolve `currentSpeakerId` from `game.players` and render the spotlight only when the flag is true and a player exists. Keep `SpeechSubtitle` after the spotlight in stacking order. Add only `.debate-shell--v2` scoped positioning rules.

- [ ] **Step 4: Integrate werewolf directly in the v2 arena**

Resolve the player from `props.activeSpeech?.playerId` and `props.game.players`; render the spotlight between `.werewolf-v2-background` and the god/player view. Never use role or faction to select the poster. Keep the bottom speech bar and controls above the spotlight.

- [ ] **Step 5: Add an explicit Undercover variant guard**

Add `variant?: 'classic' | 'v2'` to `UndercoverGame`, defaulting to `classic`. In `App.tsx`, pass `variant={route.version === 'v2' ? 'v2' : 'classic'}`. Pass `showPlayerPoster={variant === 'v2'}` to `UndercoverArena`; reuse its existing `currentSpeakerId` and public players. Render only while `game.status === 'speaking'` and a current player exists.

- [ ] **Step 6: Run the focused test and client type check**

Run:

```powershell
pnpm.cmd run test:unit -- tests/unit/playerPosterSpotlight.test.ts
pnpm.cmd --filter @ai-presenter/client run check
```

Expected: PASS, with no `any` casts added.

### Task 4: Document and verify the complete feature

**Files:**
- Modify: `docs/project-client.md`
- Verify: all files from Tasks 1-3

**Interfaces:**
- Consumes: implemented assets and client behavior.
- Produces: documented v2 visual contract and evidence-backed completion.

- [ ] **Step 1: Update the client architecture document**

Document the shared component, v2-only scope, `SpeechState.playerId`/public Undercover speech mapping, avatar fallback, reduced-motion behavior, and unchanged WebSocket/TTS/ACK boundary. Do not add a source-file index beyond the stable component/module boundary.

- [ ] **Step 2: Run complete verification**

Run:

```powershell
pnpm.cmd run check
pnpm.cmd run build
pnpm.cmd run test:unit
```

Expected: all commands exit `0`; unit summary reports zero failures.

- [ ] **Step 3: Perform visual QA**

Run the client and inspect all three v2 routes at desktop and narrow viewport widths. For at least one live/replay speech per game, verify correct player, visible seats/status/subtitles/controls, host narration without poster, poster-failure fallback, and reduced-motion behavior. Confirm classic routes show no poster.

- [ ] **Step 4: Commit intentional groups**

Commit assets/converter, shared component/tests, v2 integrations, and docs as separate commits so visual assets can be reviewed independently from behavior.
