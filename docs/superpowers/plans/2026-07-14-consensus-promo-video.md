# CONSENSUS Promo Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and render a 60-second Chinese 16:9 HyperFrames promotion video for CONSENSUS.

**Architecture:** Keep the video isolated under `artifacts/consensus-promo-video/`. A small root composition owns clip timing and audio; six focused sub-compositions own scene layout and GSAP entrances. Existing project artwork is copied into the video-local asset directory so rendering never mutates or depends on business packages.

**Tech Stack:** HyperFrames CLI, HTML, CSS, GSAP 3, FFmpeg, Kokoro TTS through HyperFrames.

## Global Constraints

- Output is approximately 60 seconds, 1920×1080, 30fps, Chinese, and horizontal.
- Use `#0B1220`, `#2F6BFF`, `#FF8A34`, `#E83B4B`, `#F5F1E8`, `#F8FAFC`, and `#111827` only for primary UI roles.
- Use `Noto Sans SC`; headings use 800–900 weight and body text uses 500–600 weight.
- Label fictional werewolf action as `演示对局片段`; distinguish future expansion from implemented features.
- Do not modify C-side, admin, server, API, database, or shared types.
- Do not add an application dependency; HyperFrames project dependencies stay inside the artifact directory.
- Every scene has GSAP entrance animation and a transition; only the final scene may animate out.
- Timelines are synchronous and paused; no runtime randomness, infinite repeats, media control calls, or non-visual GSAP properties.

---

### Task 1: Scaffold the isolated composition and visual identity

**Files:**
- Create: `artifacts/consensus-promo-video/index.html`
- Create: `artifacts/consensus-promo-video/DESIGN.md`
- Create: `artifacts/consensus-promo-video/narration.txt`
- Create: `artifacts/consensus-promo-video/assets/`
- Create: `artifacts/consensus-promo-video/compositions/`

**Interfaces:**
- Consumes: approved design in `docs/superpowers/specs/2026-07-14-consensus-promo-video-design.md`
- Produces: a HyperFrames project root and local asset paths consumed by every later task

- [ ] **Step 1: Check the local video toolchain**

Run:

```powershell
node --version
npx hyperframes doctor
```

Expected: Node.js 22 or newer for HyperFrames, plus available Chrome and FFmpeg. If the repository Node version is older, use the bundled workspace Node runtime instead of changing the application engine.

- [ ] **Step 2: Scaffold the project**

Run from `artifacts/`:

```powershell
npx hyperframes init consensus-promo-video --non-interactive
```

Expected: `artifacts/consensus-promo-video/index.html` and project metadata are created without changing the root `package.json`.

- [ ] **Step 3: Write the visual identity**

Create `DESIGN.md` with these exact sections and rules:

```markdown
# CONSENSUS Promo Visual Identity

## Style Prompt
High-energy Chinese variety-show pacing that moves between a moonlit werewolf stage and a bright AI studio. Warm orange communicates drama and action; cold blue communicates AI configuration and reliability. Typography is bold, readable, and editorial rather than neon or cyberpunk.

## Colors
- Moon night `#0B1220`
- Technology blue `#2F6BFF`
- Fire orange `#FF8A34`
- Reversal red `#E83B4B`
- Studio ivory `#F5F1E8`
- Dark/light text `#111827` / `#F8FAFC`

## Typography
- `Noto Sans SC`, 800–900 for headings
- `Noto Sans SC`, 500–600 for body and captions

## Motion
- Elastic card entrances, decisive vote locks, directional wipes, circular day/night reveals
- Three varied eases per scene; no jump cuts or infinite ambient loops

## What NOT to Do
- No full-screen dark linear gradients
- No low-contrast small text
- No cheap rainbow neon or excessive glow
- No unlabelled fictional gameplay
- No claims that future game cards are already implemented
```

- [ ] **Step 4: Write the narration script**

Create `narration.txt`:

```text
如果一桌狼人杀，没有一个真人？
十二个 AI 玩家，各自观察、隐藏、判断，也会在最后一秒翻盘。
预言家强势查杀。女巫逆转夜晚。白狼王自爆，带走关键神职。
从经典预女猎守，到白狼王、动物园、情侣阵营与火力模式，每一局，都有新的推理变量。
它们不只会隐藏，也会论证、反驳与说服。AI 辩论，让观点真正交锋。
模型供应商、玩家主模型与备用模型、音色 TTS、角色模式、历史回放、AI Trace 与工作流调试，一处配置。
今天是 AI 辩论和 AI 狼人杀。明天，更多玩法可以从同一套智能工作流继续生长。
CONSENSUS。下一场游戏，由 AI 重新定义。
```

- [ ] **Step 5: Copy only selected existing artwork**

Copy these files without modifying their sources:

```powershell
Copy-Item ..\..\packages\client\src\asserts\werewolf-v2-day.png assets\werewolf-day.png
Copy-Item ..\..\packages\client\src\asserts\werewolf-v2-night.png assets\werewolf-night.png
Copy-Item ..\werewolf-v2-role-interactions.png assets\role-interactions.png
Copy-Item ..\werewolf-v2-player-ring.png assets\player-ring.png
Copy-Item ..\..\packages\client\src\asserts\debate.png assets\debate.png
```

Expected: five video-local assets exist and the original files remain unchanged.

### Task 2: Build six focused animated scenes

**Files:**
- Create: `artifacts/consensus-promo-video/compositions/intro.html`
- Create: `artifacts/consensus-promo-video/compositions/highlights.html`
- Create: `artifacts/consensus-promo-video/compositions/modes.html`
- Create: `artifacts/consensus-promo-video/compositions/debate.html`
- Create: `artifacts/consensus-promo-video/compositions/admin.html`
- Create: `artifacts/consensus-promo-video/compositions/finale.html`

**Interfaces:**
- Consumes: local assets from Task 1 and the palette in `DESIGN.md`
- Produces: composition IDs `promo-intro`, `promo-highlights`, `promo-modes`, `promo-debate`, `promo-admin`, and `promo-finale`

- [ ] **Step 1: Author static hero-frame layouts**

Each file uses a `<template>` wrapper and this contract:

```html
<template id="promo-*-template">
  <div data-composition-id="promo-*" data-width="1920" data-height="1080">
    <div class="scene-content">...</div>
    <style>
      [data-composition-id="promo-*"] { width: 100%; height: 100%; overflow: hidden; font-family: "Noto Sans SC", sans-serif; }
      [data-composition-id="promo-*"] .scene-content { width: 100%; height: 100%; padding: 96px 120px; display: flex; flex-direction: column; gap: 28px; box-sizing: border-box; }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <script>/* synchronous paused timeline registered under the exact composition ID */</script>
  </div>
</template>
```

Use these scene-specific hero frames:

| Composition | Duration | Hero-frame content |
| --- | ---: | --- |
| `promo-intro` | 4s | question headline, 12 seat dots, `AI 全员入局` pill |
| `promo-highlights` | 16s | night background, three action cards, vote counter, persistent `演示对局片段` label |
| `promo-modes` | 10s | five mode cards and a compact `昼夜 / 警长 / 技能 / MVP / 回放` capability rail |
| `promo-debate` | 9s | bright stage, opposing argument cards, judge score, debate artwork |
| `promo-admin` | 12s | readable model/TTS configuration rows plus Trace/workflow timeline cards |
| `promo-finale` | 9s | two implemented game cards, three outlined future slots, CONSENSUS lockup |

- [ ] **Step 2: Add deterministic entrance timelines**

Every composition registers a paused timeline synchronously:

```js
window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
tl.from(".eyebrow", { y: 24, opacity: 0, duration: 0.45, ease: "power2.out" }, 0.2);
tl.from(".headline", { x: -56, opacity: 0, duration: 0.7, ease: "expo.out" }, 0.35);
tl.from(".card", { y: 52, opacity: 0, rotation: 2, duration: 0.62, stagger: 0.12, ease: "back.out(1.4)" }, 0.65);
window.__timelines["promo-*"] = tl;
```

Replace `promo-*` with the exact scene ID. Animate every visible hero-frame element in. Only `promo-finale` may fade its lockup at the end.

- [ ] **Step 3: Add scene-specific motion**

- `highlights`: reveal action cards at 0.8s, 5.4s, and 10.2s; lock vote digits after the third card.
- `modes`: stagger five cards by 100–140ms and sweep the capability rail once.
- `debate`: enter positive and negative cards from opposite sides, then reveal the judge score.
- `admin`: transform feature chips into aligned configuration rows and reveal the Trace timeline last.
- `finale`: show implemented cards solid and future slots as labelled outlines; never give future slots live-state badges.

- [ ] **Step 4: Run scene-level lint**

Run:

```powershell
npx hyperframes lint
```

Expected: no missing composition IDs, timeline registration errors, or forbidden animation patterns.

### Task 3: Assemble timing, transitions, narration, captions, and original soundtrack

**Files:**
- Modify: `artifacts/consensus-promo-video/index.html`
- Create: `artifacts/consensus-promo-video/assets/narration.wav`
- Create: `artifacts/consensus-promo-video/assets/music.wav`

**Interfaces:**
- Consumes: six composition IDs from Task 2 and `narration.txt`
- Produces: one 60-second root composition with audio on separate tracks

- [ ] **Step 1: Generate Chinese narration**

Run:

```powershell
npx hyperframes tts narration.txt --voice zf_xiaoxiao --output assets\narration.wav
```

Expected: a clear Chinese WAV file. If `zf_xiaoxiao` is unavailable, run `npx hyperframes tts --list` and select the first available Chinese female voice; record the selected voice in `DESIGN.md`.

- [ ] **Step 2: Generate an original 60-second instrumental bed with FFmpeg**

Run one FFmpeg filter graph that combines low suspense tones for 0–20s and a brighter rhythmic pulse for 20–60s, then normalizes below narration:

```powershell
ffmpeg -y -f lavfi -i "sine=frequency=55:duration=60" -f lavfi -i "sine=frequency=110:duration=60" -f lavfi -i "sine=frequency=220:duration=60" -filter_complex "[0:a]volume=0.05[a0];[1:a]volume=0.025,afade=t=in:st=18:d=3[a1];[2:a]volume=0.018,afade=t=in:st=28:d=4[a2];[a0][a1][a2]amix=inputs=3:normalize=0,afade=t=in:st=0:d=1,afade=t=out:st=57:d=3" -ar 48000 assets\music.wav
```

Expected: an original 60-second WAV with no copyright dependency.

- [ ] **Step 3: Assemble the root composition**

Use a standalone root `<div data-composition-id="consensus-promo" data-start="0" data-duration="60" data-width="1920" data-height="1080">` and these clips:

```html
<div id="scene-intro" data-composition-id="promo-intro" data-composition-src="compositions/intro.html" data-start="0" data-duration="4" data-track-index="1"></div>
<div id="scene-highlights" data-composition-id="promo-highlights" data-composition-src="compositions/highlights.html" data-start="4" data-duration="16" data-track-index="1"></div>
<div id="scene-modes" data-composition-id="promo-modes" data-composition-src="compositions/modes.html" data-start="20" data-duration="10" data-track-index="1"></div>
<div id="scene-debate" data-composition-id="promo-debate" data-composition-src="compositions/debate.html" data-start="30" data-duration="9" data-track-index="1"></div>
<div id="scene-admin" data-composition-id="promo-admin" data-composition-src="compositions/admin.html" data-start="39" data-duration="12" data-track-index="1"></div>
<div id="scene-finale" data-composition-id="promo-finale" data-composition-src="compositions/finale.html" data-start="51" data-duration="9" data-track-index="1"></div>
<audio id="narration" src="assets/narration.wav" data-start="0" data-duration="60" data-track-index="6" data-volume="1"></audio>
<audio id="music" src="assets/music.wav" data-start="0" data-duration="60" data-track-index="7" data-volume="0.28"></audio>
```

- [ ] **Step 4: Add transition overlays**

Create five separate transition clips on track 3 at 3.65s, 19.65s, 29.65s, 38.65s, and 50.65s. Each lasts 0.7s and uses a paused GSAP timeline to animate a solid palette-colored wipe or flash across the frame. Transition clips may overlap scene track clips because they use a separate track.

- [ ] **Step 5: Add dynamic captions inside each scene**

Split the narration into one or two readable caption groups per scene. Use 34–44px type, a maximum width of 1380px, and `gsap.from()` for each caption line. Captions stay above the bottom 72px safe area and never cover the primary action card.

### Task 4: Validate, inspect, render, and verify delivery

**Files:**
- Create: `artifacts/consensus-promo-video/renders/consensus-promo.mp4`
- Create: `artifacts/consensus-promo-video/.hyperframes/anim-map/animation-map.json`

**Interfaces:**
- Consumes: complete root composition from Task 3
- Produces: validated source and final MP4

- [ ] **Step 1: Run structural and contrast checks**

Run:

```powershell
npx hyperframes lint
npx hyperframes validate
```

Expected: both commands exit 0; fix all structural errors and WCAG contrast warnings before continuing.

- [ ] **Step 2: Inspect layout at dense samples and hero frames**

Run:

```powershell
npx hyperframes inspect --samples 15
npx hyperframes inspect --at 2,8,14,24,34,44,56
```

Expected: no unmarked text overflow, clipping, or off-canvas content.

- [ ] **Step 3: Generate and review the animation map**

Run:

```powershell
node C:\Users\Administrator\.codex\plugins\cache\openai-curated-remote\hyperframes\0.1.2\skills\hyperframes\scripts\animation-map.mjs . --out .hyperframes\anim-map
```

Expected: inspect `animation-map.json`; resolve unexplained `offscreen`, `collision`, `invisible`, `paced-fast`, and `paced-slow` flags. Holds are acceptable only where narration needs a readable pause.

- [ ] **Step 4: Render the final MP4**

Run:

```powershell
npx hyperframes render --output renders\consensus-promo.mp4 --fps 30 --quality high --strict
```

Expected: render completes without lint failure and writes the requested MP4.

- [ ] **Step 5: Verify media metadata and playability**

Run:

```powershell
ffprobe -v error -show_entries format=duration -show_entries stream=codec_name,width,height,r_frame_rate -of json renders\consensus-promo.mp4
```

Expected: H.264/AAC-compatible MP4, 1920×1080, 30fps, and approximately 60 seconds.

- [ ] **Step 6: Review the final rendered frame sequence**

Extract contact-sheet frames at 2, 8, 14, 24, 34, 44, and 56 seconds and visually confirm scene identity, fictional-content label, readable captions, B-side configuration, and final CONSENSUS lockup.

