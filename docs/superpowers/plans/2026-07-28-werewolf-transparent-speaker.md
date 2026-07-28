# 狼人杀 V2 透明发言人物 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让狼人杀 V2 的全部 13 个内置玩家在发言时只显示完整透明立绘，不再出现海报背景、黑边或文字遮挡。

**Architecture:** 保留共享 `PlayerPosterSpotlight`，为其增加默认不变的 `poster` / `cutout` 素材变体；狼人杀 V2 只选择 `cutout` 变体，其他模式继续使用原海报。透明素材作为静态 WebP 交付，狼人杀局部 CSS 负责人物安全区和发言阶段的中央内容隐藏。

**Tech Stack:** React 18、TypeScript、CSS、Vite、Node.js `node:test`、WebP alpha 静态素材。

## Global Constraints

- 覆盖 `packages/client/public/player-posters` 中已有的全部 13 个内置人物。
- 原 `player-posters` 文件不删除、不覆盖；透明素材放在 `packages/client/public/player-poster-cutouts/`。
- 透明素材失败时只回退到玩家头像、姓名首字母，不回退到带背景的旧海报。
- 只改变狼人杀 V2；辩论、谁是卧底和经典狼人杀保持现状。
- 不修改后端、WebSocket、游戏流程、AI 调度、数据库、共享事件类型或运行时依赖。
- 不暂存或提交当前工作区中与本任务无关的用户改动。

---

### Task 1: 扩展海报路径解析

**Files:**
- Modify: `packages/client/src/components/PlayerPosterSpotlight/posters.ts`
- Modify: `tests/unit/playerPosterSpotlight.test.ts`

**Interfaces:**
- Consumes: `PosterPlayer`
- Produces: `PlayerPosterVariant = 'poster' | 'cutout'`
- Produces: `resolvePlayerPoster(player?: PosterPlayer | null, variant?: PlayerPosterVariant): string | null`

- [ ] **Step 1: 写入失败测试**

在现有别名解析测试后增加：

```ts
test('resolves transparent cutout paths without changing default poster paths', () => {
  const player = { nickname: 'Claude Code' };
  assert.equal(resolvePlayerPoster(player), '/player-posters/claude-code.webp');
  assert.equal(resolvePlayerPoster(player, 'cutout'), '/player-poster-cutouts/claude-code.webp');
  assert.equal(resolvePlayerPoster({ nickname: '自定义玩家' }, 'cutout'), null);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```powershell
pnpm.cmd test:unit -- playerPosterSpotlight.test.ts
```

Expected: FAIL，因为 `cutout` 仍返回 `/player-posters/claude-code.webp`。

- [ ] **Step 3: 写入最小路径实现**

在 `posters.ts` 中增加：

```ts
export type PlayerPosterVariant = 'poster' | 'cutout';

const POSTER_DIRECTORY_BY_VARIANT: Record<PlayerPosterVariant, string> = {
  poster: 'player-posters',
  cutout: 'player-poster-cutouts',
};
```

将解析函数改为：

```ts
export function resolvePlayerPoster(
  player?: PosterPlayer | null,
  variant: PlayerPosterVariant = 'poster',
): string | null {
  const slug = [player?.nickname, player?.name]
    .map(normalizePlayerAlias)
    .map((alias) => POSTER_SLUG_BY_ALIAS[alias])
    .find(Boolean);
  return slug ? `/${POSTER_DIRECTORY_BY_VARIANT[variant]}/${slug}.webp` : null;
}
```

- [ ] **Step 4: 运行测试并确认通过**

Run:

```powershell
pnpm.cmd test:unit -- playerPosterSpotlight.test.ts
```

Expected: PASS。

- [ ] **Step 5: 提交路径解析**

```powershell
git add packages/client/src/components/PlayerPosterSpotlight/posters.ts tests/unit/playerPosterSpotlight.test.ts
git commit -m "feat(client): resolve transparent player cutouts"
```

---

### Task 2: 交付 13 个透明人物素材

**Files:**
- Create: `packages/client/public/player-poster-cutouts/chatgpt.webp`
- Create: `packages/client/public/player-poster-cutouts/claude-code.webp`
- Create: `packages/client/public/player-poster-cutouts/deepseek.webp`
- Create: `packages/client/public/player-poster-cutouts/doubao.webp`
- Create: `packages/client/public/player-poster-cutouts/gemini.webp`
- Create: `packages/client/public/player-poster-cutouts/grok.webp`
- Create: `packages/client/public/player-poster-cutouts/kimi.webp`
- Create: `packages/client/public/player-poster-cutouts/meta.webp`
- Create: `packages/client/public/player-poster-cutouts/qwen.webp`
- Create: `packages/client/public/player-poster-cutouts/wenxin.webp`
- Create: `packages/client/public/player-poster-cutouts/xinghuo.webp`
- Create: `packages/client/public/player-poster-cutouts/yuanbao.webp`
- Create: `packages/client/public/player-poster-cutouts/zhipu.webp`
- Modify: `tests/unit/playerPosterSpotlight.test.ts`

**Interfaces:**
- Consumes: source files in `packages/client/public/player-posters/`
- Produces: same-name WebP files with alpha channel in `/player-poster-cutouts/`

- [ ] **Step 1: 扩展素材清单测试**

在测试文件中增加：

```ts
test('ships the exact 13 transparent speaker cutouts', () => {
  const cutoutDir = path.join(process.cwd(), 'packages', 'client', 'public', 'player-poster-cutouts');
  const cutoutFiles = fs.readdirSync(cutoutDir).filter((file) => file.endsWith('.webp')).sort();
  assert.deepEqual(cutoutFiles, EXPECTED_POSTERS);
  for (const file of cutoutFiles) {
    assert.ok(fs.statSync(path.join(cutoutDir, file)).size > 20_000, `${file} should contain a real cutout`);
  }
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```powershell
pnpm.cmd test:unit -- playerPosterSpotlight.test.ts
```

Expected: FAIL with `ENOENT` for `player-poster-cutouts`。

- [ ] **Step 3: 为每个源海报生成纯色键控版本**

对 13 个源文件逐一使用内置图像编辑，输入角色为“edit target”，使用同一约束：

```text
Use case: background-extraction
Asset type: transparent character cutout for an in-game speaking-stage UI
Primary request: Preserve the character identity, face, hairstyle, clothing, body proportions, pose, colors, rendering style, and full visible framing. Replace only the existing background with a perfectly flat solid #00ff00 chroma-key background.
Composition/framing: Keep the full visible character centered with padding around hair, arms, and clothing. Do not crop or enlarge.
Constraints: Background is uniform #00ff00 with no shadow, gradient, texture, reflection, floor, glow, particles, frame shapes, text, or watermark. Do not use #00ff00 in the subject.
```

若某人物含绿色主体元素，改用纯色 `#ff00ff`，其他约束不变。

将 13 个键控结果按 slug 保存到 `.superpowers/cutout-chroma/`：

```text
chatgpt.png
claude-code.png
deepseek.png
doubao.png
gemini.png
grok.png
kimi.png
meta.png
qwen.png
wenxin.png
xinghuo.png
yuanbao.png
zhipu.png
```

- [ ] **Step 4: 转换为透明 WebP**

对全部键控文件运行已安装的去背景工具：

```powershell
$cutoutSlugs = @(
  'chatgpt', 'claude-code', 'deepseek', 'doubao', 'gemini', 'grok', 'kimi',
  'meta', 'qwen', 'wenxin', 'xinghuo', 'yuanbao', 'zhipu'
)
New-Item -ItemType Directory -Force 'packages\client\public\player-poster-cutouts' | Out-Null
foreach ($cutoutSlug in $cutoutSlugs) {
  & 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' `
    'C:\Users\Administrator\.codex\skills\.system\imagegen\scripts\remove_chroma_key.py' `
    --input ".superpowers\cutout-chroma\$cutoutSlug.png" `
    --out "packages\client\public\player-poster-cutouts\$cutoutSlug.webp" `
    --auto-key border `
    --soft-matte `
    --transparent-threshold 12 `
    --opaque-threshold 220 `
    --despill
}
```

保留生成源文件在 `.superpowers/` 或临时目录，不提交键控中间文件。

- [ ] **Step 5: 验证 alpha 与主体覆盖**

Run:

```powershell
& 'C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -c "from pathlib import Path; from PIL import Image; files=sorted(Path(r'packages/client/public/player-poster-cutouts').glob('*.webp')); assert len(files)==13, f'expected 13 cutouts, got {len(files)}'; images=[Image.open(path).convert('RGBA') for path in files]; assert all((lambda image,alpha: [alpha.getpixel((0,0)),alpha.getpixel((image.width-1,0)),alpha.getpixel((0,image.height-1)),alpha.getpixel((image.width-1,image.height-1))]==[0,0,0,0] and bool(alpha.getbbox()) and 0.12<=sum(alpha.histogram()[250:])/(image.width*image.height)<=0.85)(image,image.getchannel('A')) for image in images); print('validated',len(files),'transparent cutouts')"
```

Expected: `validated 13 transparent cutouts`。

- [ ] **Step 6: 逐张视觉检查**

逐一在深色和浅色棋盘背景上查看 13 个 WebP。若出现发丝缺口、绿色边缘或人物主体被删除，仅重做该文件；不批量修改已通过素材。

- [ ] **Step 7: 运行素材清单测试**

Run:

```powershell
pnpm.cmd test:unit -- playerPosterSpotlight.test.ts
```

Expected: PASS。

- [ ] **Step 8: 提交透明素材**

```powershell
git add packages/client/public/player-poster-cutouts tests/unit/playerPosterSpotlight.test.ts
git commit -m "feat(client): add transparent player cutouts"
```

---

### Task 3: 为共享发言组件增加透明立绘模式

**Files:**
- Modify: `packages/client/src/components/PlayerPosterSpotlight/index.tsx`
- Modify: `tests/unit/playerPosterSpotlight.test.ts`

**Interfaces:**
- Consumes: `PlayerPosterVariant` and `resolvePlayerPoster(player, variant)` from Task 1
- Produces: `PlayerPosterSpotlight({ player, className?, variant? })`
- Default: `variant = 'poster'`

- [ ] **Step 1: 写入失败的组件契约测试**

在 `keeps the spotlight accessible and resilient` 测试中增加：

```ts
assert.match(component, /variant = 'poster'/);
assert.match(component, /resolvePlayerPoster\(player, variant\)/);
assert.match(component, /variant === 'cutout'/);
assert.match(component, /is-cutout/);
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```powershell
pnpm.cmd test:unit -- playerPosterSpotlight.test.ts
```

Expected: FAIL，因为组件尚未接受 `variant`。

- [ ] **Step 3: 实现最小透明模式**

导入类型并扩展 Props：

```ts
import type { PlayerPosterVariant, PosterPlayer } from './posters';

interface PlayerPosterSpotlightProps {
  player?: PosterPlayer | null;
  className?: string;
  variant?: PlayerPosterVariant;
}
```

组件签名和解析改为：

```ts
export function PlayerPosterSpotlight({
  player,
  className = '',
  variant = 'poster',
}: PlayerPosterSpotlightProps) {
  const poster = resolvePlayerPoster(player, variant);
  const avatar = getPosterPlayerAvatar(player);
  const isCutout = variant === 'cutout';
```

渲染约束：

```tsx
{!isCutout && imageSource && (
  <img className="player-poster-spotlight__backdrop" src={imageSource} alt="" aria-hidden="true" />
)}
{!isCutout && <div className="player-poster-spotlight__shade" aria-hidden="true" />}
<div className={`player-poster-spotlight__card${isCutout ? ' is-cutout' : ''}${imageSource ? '' : ' is-name-only'}`}>
  {imageSource ? (
    <img
      className="player-poster-spotlight__portrait"
      src={imageSource}
      alt=""
      onError={() => setSourceIndex((index) => index + 1)}
    />
  ) : (
    <span className="player-poster-spotlight__initials" aria-hidden="true">
      {playerName.slice(0, 2).toUpperCase()}
    </span>
  )}
  {!isCutout && (
    <footer className="player-poster-spotlight__caption">
      <small>正在发言</small>
      <strong>{playerName}</strong>
    </footer>
  )}
</div>
```

保持 `sources` 为 `[poster, avatar]`。因此透明素材失败后直接回退头像，再回退姓名首字母，不会使用旧海报。

- [ ] **Step 4: 运行单元测试和类型检查**

Run:

```powershell
pnpm.cmd test:unit -- playerPosterSpotlight.test.ts
pnpm.cmd --filter @ai-presenter/client run check
```

Expected: PASS。

- [ ] **Step 5: 提交组件模式**

```powershell
git add packages/client/src/components/PlayerPosterSpotlight/index.tsx tests/unit/playerPosterSpotlight.test.ts
git commit -m "feat(client): support cutout speaker spotlight"
```

---

### Task 4: 接入狼人杀 V2 并建立安全区

**Files:**
- Modify: `packages/client/src/features/werewolf-v2/components/WerewolfArenaV2/index.tsx`
- Modify: `packages/client/src/features/werewolf-v2/components/WerewolfArenaV2/index.css`
- Modify: `tests/unit/playerPosterSpotlight.test.ts`

**Interfaces:**
- Consumes: `PlayerPosterSpotlight` cutout variant from Task 3
- Produces: 狼人杀 V2 发言态透明人物布局

- [ ] **Step 1: 写入失败的狼人杀接线测试**

扩展 `scopes poster spotlight wiring to v2 game routes`：

```ts
const werewolfCss = read('packages/client/src/features/werewolf-v2/components/WerewolfArenaV2/index.css');
assert.match(werewolfArena, /variant="cutout"/);
assert.match(werewolfCss, /object-fit:\s*contain/);
assert.match(
  werewolfCss,
  /\[data-speech-active='true'\]\s+\.interaction-stage\s*\{\s*display:\s*none;/,
);
assert.doesNotMatch(werewolfCss, /player-poster-spotlight__backdrop/);
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```powershell
pnpm.cmd test:unit -- playerPosterSpotlight.test.ts
```

Expected: FAIL，因为狼人杀尚未启用透明模式，CSS 仍包含模糊背景。

- [ ] **Step 3: 启用透明立绘模式**

将发言人物渲染改为：

```tsx
{speakingPlayer && (
  <PlayerPosterSpotlight
    key={speakingPlayer.id}
    player={speakingPlayer}
    className="werewolf-v2-speaker-backdrop"
    variant="cutout"
  />
)}
```

- [ ] **Step 4: 用局部 CSS 替换海报式表现**

删除狼人杀局部样式中 `player-poster-spotlight__backdrop`、`player-poster-spotlight__shade`、全屏 inset 和 `object-fit: cover` 规则，替换为：

```css
.werewolf-v2-speaker-backdrop {
  z-index: 0;
  pointer-events: none;
}

.werewolf-v2-speaker-backdrop .player-poster-spotlight__card {
  position: absolute;
  inset:
    clamp(78px, 10vh, 112px)
    clamp(330px, 26vw, 440px)
    clamp(168px, 22vh, 240px);
  width: auto;
  height: auto;
  aspect-ratio: auto;
  border: 0;
  border-radius: 0;
  opacity: 1;
  background: none;
  box-shadow: none;
  filter: drop-shadow(0 24px 30px rgba(0, 0, 0, .34));
  transform: none;
}

.werewolf-v2-speaker-backdrop .player-poster-spotlight__portrait {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center bottom;
}

.werewolf-v2-arena[data-speech-active='true'] .interaction-stage {
  display: none;
}
```

保留现有底部字幕尺寸、完成态结果层、身份栏偏移和减少动态效果规则。

- [ ] **Step 5: 运行单元测试和前端检查**

Run:

```powershell
pnpm.cmd test:unit -- playerPosterSpotlight.test.ts
pnpm.cmd --filter @ai-presenter/client run check
```

Expected: PASS。

- [ ] **Step 6: 提交狼人杀接入**

```powershell
git add packages/client/src/features/werewolf-v2/components/WerewolfArenaV2/index.tsx packages/client/src/features/werewolf-v2/components/WerewolfArenaV2/index.css tests/unit/playerPosterSpotlight.test.ts
git commit -m "fix(client): show unobstructed werewolf speaker cutouts"
```

---

### Task 5: 文档与完整验证

**Files:**
- Modify: `docs/project-client.md`

**Interfaces:**
- Consumes: Tasks 1–4 的最终行为
- Produces: 项目文档中的透明立绘约定和可复现验证记录

- [ ] **Step 1: 更新客户端项目文档**

在狼人杀 V2 展示规则中写明：

```markdown
- 发言人物使用 `/player-poster-cutouts/` 下由 `resolvePlayerPoster` 映射的同名透明 WebP；只展示人物主体。
- 透明立绘失败时依次回退玩家头像和姓名首字母，不回退旧海报。
- 发言期间中央交互层隐藏，人物位于顶部阶段栏与底部字幕之间的安全区。
- 其他游戏模式继续使用 `/player-posters/` 下由 `resolvePlayerPoster` 映射的同名海报 WebP。
```

- [ ] **Step 2: 运行透明素材检查**

重新运行 Task 2 Step 5 的 alpha 检查。

Expected: `validated 13 transparent cutouts`。

- [ ] **Step 3: 运行定向单元测试**

Run:

```powershell
pnpm.cmd test:unit -- playerPosterSpotlight.test.ts
```

Expected: PASS。

- [ ] **Step 4: 运行客户端类型检查**

Run:

```powershell
pnpm.cmd --filter @ai-presenter/client run check
```

Expected: exit code 0。

- [ ] **Step 5: 运行客户端生产构建**

Run:

```powershell
pnpm.cmd build:client
```

Expected: Vite production build succeeds。

- [ ] **Step 6: 浏览器视觉验收**

启动现有客户端并进入 `/game/v2/werewolf` 的真实发言状态，分别验证日间和夜间：

- 2048×1059
- 1920×1080
- 1440×810

每个视口检查：

- 人物原背景、黑边、卡片和中央标题不可见。
- 人物头部不碰顶部阶段栏。
- 人物底部不被发言字幕遮挡。
- 左右席位仍可见、可点击。
- 切换至少 3 个不同人物，确认浅色头发、深色头发和不同服装边缘自然。
- 将最终截图与用户原问题截图并排检查。

- [ ] **Step 7: 检查无关改动未被纳入**

Run:

```powershell
git status --short
git diff --check
```

Expected: 只出现本任务文件或用户原有未提交文件；不得暂存用户原有后端改动。

- [ ] **Step 8: 提交文档**

```powershell
git add docs/project-client.md
git commit -m "docs: document transparent werewolf speakers"
```

- [ ] **Step 9: 最终提交范围复核**

Run:

```powershell
git log --oneline -5
git status --short
```

Expected: 本任务提交只包含透明素材、发言组件、狼人杀 V2 局部样式、定向测试和客户端文档；用户原有后端改动仍未暂存。
