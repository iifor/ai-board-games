# 狼人杀技能交互验收（2026-11-08）

## 交付范围

在原有圆桌、人物、发言聚光灯与上警/退水短动效上，补充施法者亮起、人物间轨迹、目标响应、结果浮现。查验、狼刀、治疗、毒药、守护、枪击、决斗、羁绊、封印、梦境、冰冻/解冻、技能卡、转化、爆破、警徽和身份揭示使用各自图形与颜色。

行动表示使用技能；结果表示真实结算。普通查验不从角色表补全身份，范围查验只显示一份汇总；自我确认不画成自我攻击。幻象承伤、反噬和殉情只沿已知行动/关系连接到实际结算对象。学习技能卡返回学习者，交换不移动人物座次。

## 验证结果

- 前端 13 个测试文件、154 项测试通过；新增的交互与时钟测试覆盖全部 31 个板子的实际规则事件、隐私、方向、守护/解药组合、幻象、范围汇总、解冻及已知羁绊。前端与游戏规则联合运行的 52 个测试文件、426 项测试通过；之后新增解冻用例的前端测试已单独重跑通过。
- 前端 TypeScript 检查及 Vite 生产构建通过；`git diff --check` 通过（仅 LF/CRLF 提示）。
- 内存规则采样：31 个板子 × 2 个种子，加 18 个定向场景；与角色目录和动效目录逐项比较，覆盖 55 个角色键、16 类动效。定向场景包括白狼王、炸弹人、灵狼四种学习、反伤、幻象承伤、延迟死亡、大树生命、狼弟入队、叛变狼人，以及守护/解药四种组合。这是规则事件覆盖，不代表每个角色都有人类试玩。
- 浏览器桌面检查 21 个技能场景；1024×768、390×844、320×650 共 21 个响应式检查。实际人物坐标与动效落点误差小于 1 CSS 像素，结果标签没有横向溢出。手机结果来自浏览器模拟。
- 原生 Chrome 画面检查并保存了查验结果、治疗光环、狼刀合击、双向交换的实际组件画面；使用真实规则事件冻结在对应时刻。Ego 的截图接口超时，布局和时钟检查仍正常。
- 按用户要求关闭语音，创建真实脚本化调试局 `m_4963b8d9-0590-46da-9d73-56e813fa9d6f`（灵狼板子、种子 7）。先在黑夜断点暂停，静音后连续运行。后端完成 230 个事件，模型调用 0；前端 3× 静音完整播放到终局，观察到 53 次技能表现，未出现多个残留技能层，未观测到朗读，音频资源请求为 0。脚本化调试局现在默认静音。
- 在上述真实调试回放中验证减少动态效果：技能动画数为 0，结果文字和静态轨迹仍可见。

本次没有调用付费模型或云端语音，没有修改游戏规则、后端、API、数据库结构或共享协议类型。数据库仅新增上述本地调试对局。未验证实体手机和人工全角色试玩。

本地证据位于 `tmp/skill-interactions-20261108/`：`coverage.json`、`desktop-checks.json`、`responsive-checks.json`、`live-observed.json`、`server-debug.json`、`reduced-checks.json` 和 `visual-*.png`。该目录被 Git 忽略，不包含管理员密码或令牌。

## 文件与职责

| 状态 | 文件（相对 `packages/client/src/features/game-stage/`） | 职责 |
| --- | --- | --- |
| 新增 | `animation/skillTypes.ts` | 前端技能提示、坐标和标记类型 |
| 新增 | `animation/skillResults.ts` | 可见的真实结算、反伤、承伤、身份和范围反馈 |
| 新增 | `animation/skillLinks.ts` | 已知羁绊的连锁来源 |
| 新增 | `animation/skillPlan.ts` | 人物间轨迹、实际受益者与标签位置 |
| 新增 | `animation/skillKeyframes.ts` | 发动、轨迹、目标、粒子、结果关键帧 |
| 新增 | `animation/skillTiming.ts` | 独立于音频的最短展示时间与变速/中止 |
| 新增 | `animation/skillMarks.ts` | 已知状态、资源和到期清理 |
| 新增 | `hooks/useSeatAnchors.ts` | 实际立绘坐标与缩放/窗口变化跟踪 |
| 新增 | `hooks/useSkillMotion.ts` | WAAPI 生命周期、统一时钟与减少动态效果 |
| 新增 | `components/SkillInteraction.tsx` | 技能图层组合 |
| 新增 | `components/SkillRoutes.tsx` | 光束、弹道、药剂与技能卡轨迹 |
| 新增 | `components/SkillTargets.tsx` | 发动者、目标响应及结果文字 |
| 新增 | `components/SkillRelease.tsx` | 天亮解冻碎片与反馈 |
| 新增 | `components/SkillInteraction.css` | 轨迹、结果文字、叠层与静态降级 |
| 新增 | `components/SkillImpact.css` | 各类目标响应、施法灯光和解冻样式 |
| 新增 | `components/SeatSkillMarks.tsx`、`.css` | 人物旁的已知状态与资源标记 |
| 新增 | `skillInteractions.test.ts`、`skillTiming.test.ts` | 真实事件契约及播放时钟验证 |
| 修改 | `animation/skillCatalog.ts` | 阶段与动效种类的对应 |
| 修改 | `animation/skillCue.ts` | 行动、目标、查验反馈和定向分发 |
| 修改 | `components/Stage.tsx` | 当前事件、历史与状态接入 |
| 修改 | `components/SeatCard.tsx` | 施法聚光灯、状态标记；圆桌不画旧矩形命中边框 |
| 修改 | `layouts/CircleLayout.tsx`、`.css` | 测量落点、承载新动效层和视觉层级 |
| 修改 | `layouts/types.ts` | 布局的前端控制与标记入参 |
| 修改 | `playback/media.ts` | 语音与技能展示并行，完成后再确认事件 |
| 修改 | `pages/StagePage.tsx` | 脚本化调试局默认静音 |
| 修改 | `docs/project-client.md` | 模块、播放和调试约定 |
| 新增 | 本文档 | 验收范围、证据、限制和文件清单 |

无生产文件被删除。临时视觉预览入口已移除；现有空白用户文档保留。没有新增依赖。后续可继续调整粒子密度、光束强度和各技能的节奏，不需要改规则层。
