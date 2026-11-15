# 翻牌与情侣标记增强

截图中的卡牌对应白痴翻牌。展示沿用现有已播放、当前视角可见的事件，不新增身份推断。

- 翻牌和羁绊增加人物身后的半透明大卡牌或粉色锁链，保留人物在前层。
- 前方角标由 17px 增至 28px；翻牌显示「已翻牌」，保留免于放逐与失去投票权的完整提示。
- 丘比特情侣双方显示对方座号，例如「情侣 · 7号」和「情侣 · 2号」。其他关系仍显示「羁绊」，避免混用情侣含义。
- 尾巴和命数保持原有紧凑标记，不使用翻牌背景。既有短期清理、出局清理和视角边界保持原逻辑。

## 文件职责

| 修改文件 | 职责 |
| --- | --- |
| `packages/client/src/features/game-stage/components/SeatSkillMarks.tsx` | 组合背景大图形、角标及文字标签，区分翻牌和资源计数 |
| `packages/client/src/features/game-stage/components/SeatSkillMarks.css` | 大图形尺寸、发光、人物前后层级及更醒目的角标 |
| `packages/client/src/features/game-stage/animation/skillMarks.ts` | 从已知情侣连线目标生成配对座号标签 |
| `packages/client/src/features/game-stage/skillInteractions.test.ts` | 验证情侣双方标签、翻牌背景、命数区别和空状态 |
| `docs/project-client.md`、本文 | 当前展示约定与验收记录 |

新增本文，没有新增或删除生产文件、图像资源或依赖；后端、API、数据库、共享类型无变化。

## 验证

- 本轮首次前台 TypeScript 检查通过。最终复查时，当前工作区在 `packages/games/src/werewolf/special/blackMerchant.ts:134` 报 `ctx`、`decisions` 两处隐式 `any` 错误；本轮未修改该文件，最终全量类型检查未通过。
- 前台 16 个测试文件、181 项测试通过。
- 用 ego-browser 加载真实 `CircleLayout`、`SeatSkillMarks` 和已有立绘的临时验收页，核对 2、7、10 号三处标记。背景图形实测约 95×90px，角标实测宽约 19.6px（座位整体缩放后），背景宽约为角标 4.8 倍；大图形 z-index 为 0，人物为 1，图形 pointer-events 为 none。文字分别为「情侣 · 7号」「情侣 · 2号」「已翻牌」。
- Ego 截图及底层截图请求均超时，未完成截图目测验收。以上浏览器结论来自页面语义、实际尺寸和层级检查。临时验收页面已移除。

大图形和标签继续复用既有 SVG 目录及标记组件，当前不需要继续拆分模块。
