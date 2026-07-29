# Full-Body Player Cutouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 13 existing player cutouts with identity-preserving, transparent, complete head-to-shoes portraits.

**Architecture:** Keep the existing `PlayerPosterSpotlight` component, alias map, routes, and filenames unchanged. Edit each existing WebP independently, remove its flat chroma-key background into a temporary transparent WebP, validate it, then replace only the corresponding public asset.

**Tech Stack:** Built-in image editing, `imagegen` chroma-key helper, Pillow, WebP with alpha, React/Vite client, Node unit tests.

## Global Constraints

- Preserve each character's face, skin tone, hair, upper clothing, accessories, age impression, and art style.
- Only complete missing lower body, trousers, legs, and shoes; minor arm or leg adjustments are allowed only for a natural unobstructed stance.
- Use a portrait 2:3 canvas with the head, both hands, both legs, and shoe soles visible.
- Keep transparent margins above the head and below the shoes; center the character horizontally and align shoe baselines consistently.
- Final images must have transparent backgrounds with no floor, room, stage, shadow, light spot, text, white fringe, or chroma-key residue.
- Preserve the exact 13 `.webp` filenames and their alpha channels.
- Do not modify `PlayerPosterSpotlight`, `posters.ts`, page layout, API, database, WebSocket, TTS, workflow, or shared types.
- Use `tmp/imagegen/` for intermediates and rely on Git for recovery; do not add a backup directory.
- If chroma-key removal cannot preserve hair edges, stop and request approval before using an API-key-backed native transparency path.

---

### Task 1: Produce 13 Reviewed Transparent Intermediates

**Files:**
- Read: `packages/client/public/player-poster-cutouts/chatgpt.webp`
- Read: `packages/client/public/player-poster-cutouts/claude-code.webp`
- Read: `packages/client/public/player-poster-cutouts/deepseek.webp`
- Read: `packages/client/public/player-poster-cutouts/doubao.webp`
- Read: `packages/client/public/player-poster-cutouts/gemini.webp`
- Read: `packages/client/public/player-poster-cutouts/grok.webp`
- Read: `packages/client/public/player-poster-cutouts/kimi.webp`
- Read: `packages/client/public/player-poster-cutouts/meta.webp`
- Read: `packages/client/public/player-poster-cutouts/qwen.webp`
- Read: `packages/client/public/player-poster-cutouts/wenxin.webp`
- Read: `packages/client/public/player-poster-cutouts/xinghuo.webp`
- Read: `packages/client/public/player-poster-cutouts/yuanbao.webp`
- Read: `packages/client/public/player-poster-cutouts/zhipu.webp`
- Create temporarily: `tmp/imagegen/*-key.webp`
- Create temporarily: `tmp/imagegen/*.webp`

**Interfaces:**
- Consumes: the 13 source cutouts listed above.
- Produces: 13 reviewed transparent WebPs in `tmp/imagegen/` with identical basenames.

Use this exact edit instruction for every source image:

```text
Edit the referenced character image, preserving the exact same recognizable character: face shape, facial features, skin tone, hairstyle, hair color, upper clothing, clothing colors and patterns, accessories, age impression, proportions, and illustration style. Extend only the missing lower body so the character is shown as a natural complete full-body standing portrait from the top of the head through both legs to the soles of both shoes. Both hands, both legs, and both shoes must be fully visible and unobstructed. Use a vertical 2:3 canvas, center the character horizontally, keep clear empty margin above the hair and below the shoes, and keep the shoe baseline consistent near the lower margin. Do not add or redesign clothing, logos, props, furniture, floor, stage, room, scenery, text, light spots, cast shadows, or decorative effects. Place the character on one perfectly flat, uniform chroma-key background with no gradient, texture, halo, or shadow. Use pure green #00FF00 unless the character has prominent green clothing or accessories; in that case use pure magenta #FF00FF.
```

- [ ] **Step 1: Verify the existing asset contract before generation**

Run:

```powershell
pnpm.cmd run test:unit
```

Expected: all unit tests pass, including the exact 13 cutout filenames and cutout route mapping in `playerPosterSpotlight.test.ts`.

- [ ] **Step 2: Inspect every source before editing**

Open each of the 13 source files with `view_image`. Record mentally the identity anchors required by the prompt: face, hair, upper clothing, logo or pattern, accessories, and age impression. Do not edit a source that has not been inspected.

- [ ] **Step 3: Create the temporary output directory**

Run:

```powershell
New-Item -ItemType Directory -Force -Path 'tmp/imagegen' | Out-Null
```

Expected: `tmp/imagegen/` exists and no project asset has changed.

- [ ] **Step 4: Generate and review `chatgpt`**

Call built-in image editing once with the exact instruction above and `packages/client/public/player-poster-cutouts/chatgpt.webp` as the referenced image. Copy the result to `tmp/imagegen/chatgpt-key.webp`, run:

```powershell
python 'C:\Users\Administrator\.codex\skills\.system\imagegen\scripts\remove_chroma_key.py' --input 'tmp/imagegen/chatgpt-key.webp' --out 'tmp/imagegen/chatgpt.webp' --auto-key corners --soft-matte --spill-cleanup --force
```

Open `tmp/imagegen/chatgpt.webp` with `view_image`. Accept only if the same character is complete from head to shoes with clean transparent edges; otherwise regenerate only this character.

- [ ] **Step 5: Generate and review `claude-code`**

Call built-in image editing once with the exact instruction above and `packages/client/public/player-poster-cutouts/claude-code.webp` as the referenced image. Copy the result to `tmp/imagegen/claude-code-key.webp`, run:

```powershell
python 'C:\Users\Administrator\.codex\skills\.system\imagegen\scripts\remove_chroma_key.py' --input 'tmp/imagegen/claude-code-key.webp' --out 'tmp/imagegen/claude-code.webp' --auto-key corners --soft-matte --spill-cleanup --force
```

Open `tmp/imagegen/claude-code.webp` with `view_image`. Accept only if the same character is complete from head to shoes with clean transparent edges; otherwise regenerate only this character.

- [ ] **Step 6: Generate and review `deepseek`**

Call built-in image editing once with the exact instruction above and `packages/client/public/player-poster-cutouts/deepseek.webp` as the referenced image. Copy the result to `tmp/imagegen/deepseek-key.webp`, run:

```powershell
python 'C:\Users\Administrator\.codex\skills\.system\imagegen\scripts\remove_chroma_key.py' --input 'tmp/imagegen/deepseek-key.webp' --out 'tmp/imagegen/deepseek.webp' --auto-key corners --soft-matte --spill-cleanup --force
```

Open `tmp/imagegen/deepseek.webp` with `view_image`. Accept only if the same character is complete from head to shoes with clean transparent edges; otherwise regenerate only this character.

- [ ] **Step 7: Generate and review `doubao`**

Call built-in image editing once with the exact instruction above and `packages/client/public/player-poster-cutouts/doubao.webp` as the referenced image. Copy the result to `tmp/imagegen/doubao-key.webp`, run:

```powershell
python 'C:\Users\Administrator\.codex\skills\.system\imagegen\scripts\remove_chroma_key.py' --input 'tmp/imagegen/doubao-key.webp' --out 'tmp/imagegen/doubao.webp' --auto-key corners --soft-matte --spill-cleanup --force
```

Open `tmp/imagegen/doubao.webp` with `view_image`. Accept only if the same character is complete from head to shoes with clean transparent edges; otherwise regenerate only this character.

- [ ] **Step 8: Generate and review `gemini`**

Call built-in image editing once with the exact instruction above and `packages/client/public/player-poster-cutouts/gemini.webp` as the referenced image. Copy the result to `tmp/imagegen/gemini-key.webp`, run:

```powershell
python 'C:\Users\Administrator\.codex\skills\.system\imagegen\scripts\remove_chroma_key.py' --input 'tmp/imagegen/gemini-key.webp' --out 'tmp/imagegen/gemini.webp' --auto-key corners --soft-matte --spill-cleanup --force
```

Open `tmp/imagegen/gemini.webp` with `view_image`. Accept only if the same character is complete from head to shoes with clean transparent edges; otherwise regenerate only this character.

- [ ] **Step 9: Generate and review `grok`**

Call built-in image editing once with the exact instruction above and `packages/client/public/player-poster-cutouts/grok.webp` as the referenced image. Copy the result to `tmp/imagegen/grok-key.webp`, run:

```powershell
python 'C:\Users\Administrator\.codex\skills\.system\imagegen\scripts\remove_chroma_key.py' --input 'tmp/imagegen/grok-key.webp' --out 'tmp/imagegen/grok.webp' --auto-key corners --soft-matte --spill-cleanup --force
```

Open `tmp/imagegen/grok.webp` with `view_image`. Accept only if the same character is complete from head to shoes with clean transparent edges; otherwise regenerate only this character.

- [ ] **Step 10: Generate and review `kimi`**

Call built-in image editing once with the exact instruction above and `packages/client/public/player-poster-cutouts/kimi.webp` as the referenced image. Copy the result to `tmp/imagegen/kimi-key.webp`, run:

```powershell
python 'C:\Users\Administrator\.codex\skills\.system\imagegen\scripts\remove_chroma_key.py' --input 'tmp/imagegen/kimi-key.webp' --out 'tmp/imagegen/kimi.webp' --auto-key corners --soft-matte --spill-cleanup --force
```

Open `tmp/imagegen/kimi.webp` with `view_image`. Accept only if the same character is complete from head to shoes with clean transparent edges; otherwise regenerate only this character.

- [ ] **Step 11: Generate and review `meta`**

Call built-in image editing once with the exact instruction above and `packages/client/public/player-poster-cutouts/meta.webp` as the referenced image. Copy the result to `tmp/imagegen/meta-key.webp`, run:

```powershell
python 'C:\Users\Administrator\.codex\skills\.system\imagegen\scripts\remove_chroma_key.py' --input 'tmp/imagegen/meta-key.webp' --out 'tmp/imagegen/meta.webp' --auto-key corners --soft-matte --spill-cleanup --force
```

Open `tmp/imagegen/meta.webp` with `view_image`. Accept only if the same character is complete from head to shoes with clean transparent edges; otherwise regenerate only this character.

- [ ] **Step 12: Generate and review `qwen`**

Call built-in image editing once with the exact instruction above and `packages/client/public/player-poster-cutouts/qwen.webp` as the referenced image. Copy the result to `tmp/imagegen/qwen-key.webp`, run:

```powershell
python 'C:\Users\Administrator\.codex\skills\.system\imagegen\scripts\remove_chroma_key.py' --input 'tmp/imagegen/qwen-key.webp' --out 'tmp/imagegen/qwen.webp' --auto-key corners --soft-matte --spill-cleanup --force
```

Open `tmp/imagegen/qwen.webp` with `view_image`. Accept only if the same character is complete from head to shoes with clean transparent edges; otherwise regenerate only this character.

- [ ] **Step 13: Generate and review `wenxin`**

Call built-in image editing once with the exact instruction above and `packages/client/public/player-poster-cutouts/wenxin.webp` as the referenced image. Copy the result to `tmp/imagegen/wenxin-key.webp`, run:

```powershell
python 'C:\Users\Administrator\.codex\skills\.system\imagegen\scripts\remove_chroma_key.py' --input 'tmp/imagegen/wenxin-key.webp' --out 'tmp/imagegen/wenxin.webp' --auto-key corners --soft-matte --spill-cleanup --force
```

Open `tmp/imagegen/wenxin.webp` with `view_image`. Accept only if the same character is complete from head to shoes with clean transparent edges; otherwise regenerate only this character.

- [ ] **Step 14: Generate and review `xinghuo`**

Call built-in image editing once with the exact instruction above and `packages/client/public/player-poster-cutouts/xinghuo.webp` as the referenced image. Copy the result to `tmp/imagegen/xinghuo-key.webp`, run:

```powershell
python 'C:\Users\Administrator\.codex\skills\.system\imagegen\scripts\remove_chroma_key.py' --input 'tmp/imagegen/xinghuo-key.webp' --out 'tmp/imagegen/xinghuo.webp' --auto-key corners --soft-matte --spill-cleanup --force
```

Open `tmp/imagegen/xinghuo.webp` with `view_image`. Accept only if the same character is complete from head to shoes with clean transparent edges; otherwise regenerate only this character.

- [ ] **Step 15: Generate and review `yuanbao`**

Call built-in image editing once with the exact instruction above and `packages/client/public/player-poster-cutouts/yuanbao.webp` as the referenced image. Copy the result to `tmp/imagegen/yuanbao-key.webp`, run:

```powershell
python 'C:\Users\Administrator\.codex\skills\.system\imagegen\scripts\remove_chroma_key.py' --input 'tmp/imagegen/yuanbao-key.webp' --out 'tmp/imagegen/yuanbao.webp' --auto-key corners --soft-matte --spill-cleanup --force
```

Open `tmp/imagegen/yuanbao.webp` with `view_image`. Accept only if the same character is complete from head to shoes with clean transparent edges; otherwise regenerate only this character.

- [ ] **Step 16: Generate and review `zhipu`**

Call built-in image editing once with the exact instruction above and `packages/client/public/player-poster-cutouts/zhipu.webp` as the referenced image. Copy the result to `tmp/imagegen/zhipu-key.webp`, run:

```powershell
python 'C:\Users\Administrator\.codex\skills\.system\imagegen\scripts\remove_chroma_key.py' --input 'tmp/imagegen/zhipu-key.webp' --out 'tmp/imagegen/zhipu.webp' --auto-key corners --soft-matte --spill-cleanup --force
```

Open `tmp/imagegen/zhipu.webp` with `view_image`. Accept only if the same character is complete from head to shoes with clean transparent edges; otherwise regenerate only this character.

- [ ] **Step 17: Validate all intermediate files mechanically**

Run:

```powershell
python -c "from pathlib import Path; from PIL import Image; expected={'chatgpt.webp','claude-code.webp','deepseek.webp','doubao.webp','gemini.webp','grok.webp','kimi.webp','meta.webp','qwen.webp','wenxin.webp','xinghuo.webp','yuanbao.webp','zhipu.webp'}; files={p.name for p in Path('tmp/imagegen').glob('*.webp') if not p.name.endswith('-key.webp')}; assert files == expected, (files, expected); [(lambda im,p: (assert_image := (im.size[0]*3 == im.size[1]*2 and im.getchannel('A').getextrema()[0] == 0 and (lambda b: b is not None and b[0] > 0 and b[1] > 0 and b[2] < im.size[0] and b[3] < im.size[1])(im.getchannel('A').getbbox()))) or (_ for _ in ()).throw(AssertionError(p.name)))(Image.open(p).convert('RGBA'),p) for p in sorted(Path('tmp/imagegen').glob('*.webp')) if not p.name.endswith('-key.webp')]; print('13 transparent 2:3 intermediates passed')"
```

Expected: `13 transparent 2:3 intermediates passed`.

---

### Task 2: Replace the Public Cutouts and Run Automated Checks

**Files:**
- Modify: `packages/client/public/player-poster-cutouts/chatgpt.webp`
- Modify: `packages/client/public/player-poster-cutouts/claude-code.webp`
- Modify: `packages/client/public/player-poster-cutouts/deepseek.webp`
- Modify: `packages/client/public/player-poster-cutouts/doubao.webp`
- Modify: `packages/client/public/player-poster-cutouts/gemini.webp`
- Modify: `packages/client/public/player-poster-cutouts/grok.webp`
- Modify: `packages/client/public/player-poster-cutouts/kimi.webp`
- Modify: `packages/client/public/player-poster-cutouts/meta.webp`
- Modify: `packages/client/public/player-poster-cutouts/qwen.webp`
- Modify: `packages/client/public/player-poster-cutouts/wenxin.webp`
- Modify: `packages/client/public/player-poster-cutouts/xinghuo.webp`
- Modify: `packages/client/public/player-poster-cutouts/yuanbao.webp`
- Modify: `packages/client/public/player-poster-cutouts/zhipu.webp`
- Test: `tests/unit/playerPosterSpotlight.test.ts` (reuse unchanged)

**Interfaces:**
- Consumes: the 13 approved transparent intermediates from Task 1.
- Produces: the same public URLs and filenames with new full-body image contents.

- [ ] **Step 1: Replace only the 13 existing public assets**

Run:

```powershell
Copy-Item -LiteralPath 'tmp/imagegen/chatgpt.webp' -Destination 'packages/client/public/player-poster-cutouts/chatgpt.webp' -Force
Copy-Item -LiteralPath 'tmp/imagegen/claude-code.webp' -Destination 'packages/client/public/player-poster-cutouts/claude-code.webp' -Force
Copy-Item -LiteralPath 'tmp/imagegen/deepseek.webp' -Destination 'packages/client/public/player-poster-cutouts/deepseek.webp' -Force
Copy-Item -LiteralPath 'tmp/imagegen/doubao.webp' -Destination 'packages/client/public/player-poster-cutouts/doubao.webp' -Force
Copy-Item -LiteralPath 'tmp/imagegen/gemini.webp' -Destination 'packages/client/public/player-poster-cutouts/gemini.webp' -Force
Copy-Item -LiteralPath 'tmp/imagegen/grok.webp' -Destination 'packages/client/public/player-poster-cutouts/grok.webp' -Force
Copy-Item -LiteralPath 'tmp/imagegen/kimi.webp' -Destination 'packages/client/public/player-poster-cutouts/kimi.webp' -Force
Copy-Item -LiteralPath 'tmp/imagegen/meta.webp' -Destination 'packages/client/public/player-poster-cutouts/meta.webp' -Force
Copy-Item -LiteralPath 'tmp/imagegen/qwen.webp' -Destination 'packages/client/public/player-poster-cutouts/qwen.webp' -Force
Copy-Item -LiteralPath 'tmp/imagegen/wenxin.webp' -Destination 'packages/client/public/player-poster-cutouts/wenxin.webp' -Force
Copy-Item -LiteralPath 'tmp/imagegen/xinghuo.webp' -Destination 'packages/client/public/player-poster-cutouts/xinghuo.webp' -Force
Copy-Item -LiteralPath 'tmp/imagegen/yuanbao.webp' -Destination 'packages/client/public/player-poster-cutouts/yuanbao.webp' -Force
Copy-Item -LiteralPath 'tmp/imagegen/zhipu.webp' -Destination 'packages/client/public/player-poster-cutouts/zhipu.webp' -Force
```

Expected: Git reports exactly these 13 public assets as modified by this task.

- [ ] **Step 2: Run the unit suite**

Run:

```powershell
pnpm.cmd run test:unit
```

Expected: all tests pass and `playerPosterSpotlight.test.ts` still confirms the exact 13 filenames and stable public paths.

- [ ] **Step 3: Run the client type check**

Run:

```powershell
pnpm.cmd --filter @ai-presenter/client run check
```

Expected: exit code `0`.

- [ ] **Step 4: Run the client build**

Run:

```powershell
pnpm.cmd run build:client
```

Expected: Vite completes the production client build with exit code `0`.

- [ ] **Step 5: Commit the asset replacement**

Run:

```powershell
git add -- packages/client/public/player-poster-cutouts
git commit -m "feat: complete full-body player cutouts"
```

Expected: the commit contains the 13 cutout files and no temporary images.

---

### Task 3: Verify the Debate Stage at 1280 × 720

**Files:**
- Read: `packages/client/src/features/debate/components/DebateArena/index.tsx`
- Read: `packages/client/src/features/debate-v2/DebateGameV2/index.css`
- Read: `packages/client/src/components/PlayerPosterSpotlight/index.css`
- Modify only on failure: the one rejected public cutout among the 13 files listed in Task 2

**Interfaces:**
- Consumes: the public cutouts committed in Task 2 and the existing debate v2 speaking state.
- Produces: screenshot-backed confirmation that the existing layout needs no CSS change.

- [ ] **Step 1: Open the existing debate v2 page**

Use `browser:control-in-app-browser` and the active localhost Vite URL. Navigate to `/game/v2/debate`, set the viewport to `1280 × 720`, start a standard 12-player debate, and advance to the first player-speaking state.

- [ ] **Step 2: Capture the speaking state**

Take a screenshot containing the stage title, current full-body speaker, both teams, judge area, and bottom subtitle.

- [ ] **Step 3: Apply the visual acceptance gate**

Accept only when the speaker's head, hands, legs, and shoes are all visible; the character looks like the source; no chroma fringe is visible; and the speaker does not overlap the stage title, judge area, or subtitle. If an asset fails, regenerate only that asset using Task 1's exact prompt, replace it, rerun Task 2 checks, and recapture the screenshot. Do not change CSS to hide an incomplete asset.

---

### Task 4: Update Documentation and Finish Verification

**Files:**
- Modify: `docs/project-client.md`
- Modify: `design-qa.md`
- Test: `tests/unit/playerPosterSpotlight.test.ts` (reuse unchanged)

**Interfaces:**
- Consumes: the accepted 1280 × 720 speaking-state screenshot and passing Task 2 checks.
- Produces: current client documentation and a traceable visual QA record.

- [ ] **Step 1: Update the client asset contract**

In `docs/project-client.md`, update the debate v2 cutout rule to state:

```markdown
- 辩论 v2 使用 `/player-poster-cutouts/*.webp` 透明全身立绘；所有人物从头顶到鞋底完整入镜并保留透明安全边距。舞台按完整源图等比包含，左右队伍、评委和底部字幕各自保留独立安全区，避免遮挡当前发言人物。
```

- [ ] **Step 2: Append the visual QA result**

Append this section to `design-qa.md` only after Task 3 passes:

```markdown
### 2026-07-29 辩论 v2 全身透明立绘

- 视口：1280 × 720。
- 素材：13 位玩家均保持原人物身份、发型、上衣和画风，统一为头顶到鞋底完整入镜的透明 WebP。
- 发言态：当前人物完整显示，未被阶段标题、左右队伍、评委或底部字幕遮挡。
- 透明边缘：四角透明，未发现键控色残留、白边、地面、阴影或背景元素。
- 回归：玩家文件映射、公开资源路径、API、数据库、WebSocket、TTS、工作流和共享类型均未改变。
```

- [ ] **Step 3: Run final verification**

Run:

```powershell
pnpm.cmd run test:unit
pnpm.cmd --filter @ai-presenter/client run check
pnpm.cmd run build:client
git diff --check
```

Expected: all unit tests pass, type check and build exit with code `0`, and `git diff --check` reports no whitespace errors.

- [ ] **Step 4: Commit documentation**

Run:

```powershell
git add -- docs/project-client.md design-qa.md
git commit -m "docs: record full-body cutout validation"
```

Expected: the commit contains only the two documentation files.
