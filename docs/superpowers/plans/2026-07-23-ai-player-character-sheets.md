# AI Player Character Sheets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate and deliver one consistent three-view character sheet for each of the 12 enabled AI players who do not yet have a sheet.

**Architecture:** Use the built-in image generation tool once per player, with the existing Doubao sheet as the sole style and layout reference. Copy each accepted output into one project-local artifact directory, then visually inspect every file against the same acceptance checklist.

**Tech Stack:** Built-in `image_gen`, local `view_image`, PNG artifacts.

## Global Constraints

- Reference image: `C:/Users/Administrator/Desktop/AI角色/豆包/豆包-三视图.png`.
- Output directory: `artifacts/player-character-sheets/`.
- Every sheet is square with a white background, front/side/back full-body views, and calm/happy/angry head portraits on the right.
- Render the six labels exactly once: `正视图`, `侧视图`, `背视图`, `平静`, `开心`, `生气`.
- Match the reference's polished soft 3D chibi style, body proportions, lighting, materials, spacing, and label placement.
- Do not include corporate logos, trademarks, weapons, watermarks, complex backgrounds, extra characters, or extra text.
- Do not overwrite an existing output; use a `-v2` suffix when regenerating.

---

### Task 1: Generate the Grok anchor sheet

**Files:**
- Create: `artifacts/player-character-sheets/grok-character-sheet.png`

**Interfaces:**
- Consumes: the Doubao reference image and the approved visual specification.
- Produces: the first accepted sheet, used as a consistency check before generating the remaining set.

- [ ] **Step 1: Generate the anchor**

Call built-in `image_gen` with the reference image and this prompt:

```text
Use case: stylized-concept
Asset type: game character turnaround sheet
Input images: Image 1 is the sole style, proportions, lighting, material, composition, and label-layout reference; do not copy its identity or clothing.
Primary request: create a new character sheet for Grok, a rebellious sharp-tongued young man.
Scene/backdrop: pure white studio background.
Subject: one consistent male character with messy short black hair, raised eyebrow, black and dark-red motorcycle-inspired jacket, charcoal distressed jeans, clean sneakers, and an original abstract lightning-crack chest emblem.
Style/medium: polished soft 3D chibi animation render matching Image 1, about 1:5 head-to-body ratio, large expressive eyes, rounded face, realistic cloth folds.
Composition/framing: match Image 1 exactly—front, side, and back full-body views from left to center; calm, happy, and angry head portraits stacked on the right; full bodies and shoes visible.
Text (verbatim): "正视图", "侧视图", "背视图", "平静", "开心", "生气".
Constraints: all six views show the same identity and outfit; labels appear exactly once in the same positions as Image 1; no extra text, logos, trademarks, weapons, watermark, scenery, or extra people.
```

- [ ] **Step 2: Save and inspect the anchor**

Copy the generated PNG to the exact output path, open it with `view_image`, and verify all Global Constraints plus consistent face, hair, jacket, trousers, shoes, and emblem across the six views.

- [ ] **Step 3: Regenerate only if the anchor fails**

If a concrete defect exists, make one targeted follow-up that names only that defect while repeating identity, layout, label, and no-logo invariants. Save the replacement as `grok-character-sheet-v2.png` and keep both files for comparison.

### Task 2: Generate the remaining 11 sheets

**Files:**
- Create: `artifacts/player-character-sheets/wenxin-character-sheet.png`
- Create: `artifacts/player-character-sheets/gemini-character-sheet.png`
- Create: `artifacts/player-character-sheets/kimi-character-sheet.png`
- Create: `artifacts/player-character-sheets/deepseek-character-sheet.png`
- Create: `artifacts/player-character-sheets/qwen-character-sheet.png`
- Create: `artifacts/player-character-sheets/yuanbao-character-sheet.png`
- Create: `artifacts/player-character-sheets/xinghuo-character-sheet.png`
- Create: `artifacts/player-character-sheets/zhipu-character-sheet.png`
- Create: `artifacts/player-character-sheets/chatgpt-character-sheet.png`
- Create: `artifacts/player-character-sheets/claude-code-character-sheet.png`
- Create: `artifacts/player-character-sheets/meta-character-sheet.png`

**Interfaces:**
- Consumes: the accepted Task 1 layout and the Doubao style reference.
- Produces: 11 independently reviewable PNG character sheets.

- [ ] **Step 1: Generate one image per row**

Reuse Task 1's prompt verbatim, replacing only `Primary request` and `Subject` with the matching row below. Make one built-in call per row and save to its exact filename.

| File | Primary request | Subject |
| --- | --- | --- |
| `wenxin-character-sheet.png` | Create a new character sheet for 文心一言, a warm and courteous old-school young gentleman. | One consistent male character with tied-back dark-brown long hair, gentle eyes, ivory modern Chinese long jacket, dark-teal trousers, small jade waist ornament, and an original bamboo-slip cloud chest pattern. |
| `gemini-character-sheet.png` | Create a new character sheet for Gemini, an elegant and emotionally restrained scientist. | One consistent male character with neat silver-gray short hair, cool blue eyes, blue-and-white futuristic laboratory coat, dark trousers, and an original twin-star orbital chest emblem. |
| `kimi-character-sheet.png` | Create a new character sheet for Kimi, a quiet patient night archivist. | One consistent male character with smooth blue-black short hair, calm expression, navy turtleneck, moon-white short coat, dark-gray trousers, and an original crescent-and-page chest emblem. |
| `deepseek-character-sheet.png` | Create a new character sheet for DeepSeek, a low-key cold and incisive deep-sea logician. | One consistent male character with deep-blue textured hair, sharp eyes, dark ocean-blue utility jacket, black cargo trousers, and an original sonar-ripple chest emblem. |
| `qwen-character-sheet.png` | Create a new character sheet for 千问, an assertive strategic woman who structures every problem. | One consistent female character with a high black-purple ponytail, determined eyes, purple-black cropped jacket, tailored dark trousers, and an original layered question-grid chest emblem. |
| `yuanbao-character-sheet.png` | Create a new character sheet for 元宝, a smiling quick-witted wandering merchant woman. | One consistent female character with dark-brown twin buns, smiling eyes, golden-orange modern Chinese short jacket, dark-green skirt, and an original abstract coin-and-ingot chest pattern. |
| `xinghuo-character-sheet.png` | Create a new character sheet for 讯飞星火, a bright passionate woman who inspires a crowd. | One consistent female character with a red-brown high ponytail, bright eyes, orange-red athletic hoodie, white shorts, and an original flame-and-soundwave chest emblem. |
| `zhipu-character-sheet.png` | Create a new character sheet for 智谱清言, a calm precise academic strategist. | One consistent female character with shoulder-length gray-purple hair, thin-frame glasses, gray-purple academy blazer, white shirt, pleated skirt, and an original coordinate-grid chest emblem. |
| `chatgpt-character-sheet.png` | Create a new character sheet for ChatGPT, a warm balanced mediator who translates conflict into dialogue. | One consistent male character with short chestnut curls, gentle expression, teal knitted cardigan, light shirt, beige trousers, and an original interwoven-dialogue-knot chest emblem. |
| `claude-code-character-sheet.png` | Create a new character sheet for Claude Code, a reliable exacting female programmer. | One consistent female character with short flaxen-blonde hair, focused eyes, cream-and-orange programmer utility jacket, black trousers, and an original abstract paired-bracket chest emblem. |
| `meta-character-sheet.png` | Create a new character sheet for Meta, a free-spirited open-source ranger. | One consistent male character with dark-brown curls, light stubble, indigo outdoor jacket, khaki cargo trousers, and an original open-loop-path chest emblem. |

- [ ] **Step 2: Inspect each saved image immediately**

Open each PNG with `view_image` after saving it. Record only concrete defects: inconsistent identity, wrong sex, missing or duplicated view, incorrect label, unreadable text, cropped feet, contradictory clothing, extra object/person, logo, or watermark.

- [ ] **Step 3: Apply targeted retries only where needed**

For each failed sheet, request one single-defect correction while repeating identity, layout, labels, and no-logo invariants. Save retry outputs with `-v2`; do not regenerate accepted sheets.

### Task 3: Final artifact verification

**Files:**
- Verify: `artifacts/player-character-sheets/*.png`

**Interfaces:**
- Consumes: accepted outputs from Tasks 1 and 2.
- Produces: a complete 12-player artifact set ready for user review.

- [ ] **Step 1: Verify file count and names**

Run:

```powershell
Get-ChildItem 'artifacts/player-character-sheets' -File -Filter '*.png' | Sort-Object Name | Select-Object Name,Length
```

Expected: at least one non-empty PNG for each of the 12 filenames listed in Tasks 1 and 2, with any retries clearly suffixed `-v2`.

- [ ] **Step 2: Perform the cross-set visual pass**

Inspect all accepted sheets for consistent canvas, white background, 3D finish, body scale, view placement, portrait placement, label styling, and overall family resemblance to the Doubao reference. Reject only objective failures; small pose or fabric-fold differences are acceptable.

- [ ] **Step 3: Report delivery scope**

Report the output directory and accepted filenames. State that no frontend, backend, API, database, or shared-type changes were made; list any retained `-v2` retries and why.
