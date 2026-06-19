# Codex 执行提示词：狼人杀 12 人玩法拓展

将以下提示词交给 Codex 执行实现。执行前必须先阅读本目录下的规则规格、项目约束和验收用例。

```text
你是当前仓库的资深全栈工程师，请实现“狼人杀 12 人玩法拓展”。

目标：
1. 确认并修正“预女猎守（12人）”模式：预言家、女巫、猎人、守卫、4 村民、4 狼人。
2. 新增“白狼王守卫（12人）”模式：预言家、女巫、猎人、守卫、4 村民、3 狼人、1 白狼王。
3. 实现完整白狼王规则：白狼王属于狼人阵营，夜晚参与狼队行动；白天发言阶段可自爆，并带走 1 名当前存活且非自己的合法目标；被带走目标进入现有死亡链。

编码前必须先阅读：
- AGENTS.md
- docs/README.md
- docs/project-summary.md
- docs/project-workflow.md
- docs/project-server.md
- docs/project-client.md
- docs/project-admin.md
- docs/project-shared.md
- docs/specs/werewolf-12p-expansion/rules-spec.md
- docs/specs/werewolf-12p-expansion/project-constraints.md
- docs/specs/werewolf-12p-expansion/acceptance-cases.md

定位要求：
- 如果仓库根目录存在 .codegraph/，优先使用 CodeGraph 定位狼人杀规则、死亡链、事件类型和前端消费点。
- 如果 CodeGraph 工具不可用，再使用定向搜索，不要无目的全局扫代码。

实现原则：
- 先写失败测试，再实现最小改动。
- 优先复用现有 deathResolution、self-destruct、hunter_shot、sheriff_badge、PlaybackEvent 管线。
- 不新增数据库表，除非能证明 seed 补齐无法满足现有库升级。
- 服务端是规则唯一裁判；前端不得决定死亡、胜负或技能合法性。
- 白狼王带人必须进入统一死亡链，不能直接改玩家死亡状态后跳过遗言、猎人开枪、警徽处置或胜负判定。
- 实时播放和历史回放必须消费同一最终事件语义。
- 不使用大量 any 或 as any 掩盖新增类型不清晰问题。
- 不重写整个狼人杀 workflow。

推荐执行顺序：
1. 阅读规格文档和项目文档，列出本次新增/修改文件及职责。
2. 为模式配置和白狼王角色补失败测试。
3. 为白狼王自爆带人补 workflow 失败测试，覆盖：
   - 自爆者出局。
   - 合法目标被带走。
   - 被带走猎人触发死亡技能。
   - 被带走警长触发警徽处置。
   - 自爆后当天普通发言和放逐投票中止。
4. 实现默认角色、默认模式和现有数据库补齐逻辑。
5. 实现白狼王 AI 输出、合法性校验、reducer/handler 落盘和死亡链接入。
6. 扩展必要共享事件类型或 payload。
7. 更新 C 端事件合并、展示和回放消费。
8. 确认 B 端模式列表、历史详情和调试展示正确。
9. 同步更新 docs/project-workflow.md、docs/project-server.md、docs/project-client.md、docs/project-admin.md、docs/project-shared.md。
10. 运行验证命令并修复失败。

必须运行：
- pnpm run check
- pnpm run test:workflow

如修改共享类型或前端展示，追加运行：
- pnpm run check:shared
- pnpm run check:client
- pnpm run check:admin

完成后输出：
- 新增了哪些文件。
- 修改了哪些文件。
- 删除了哪些文件。
- 每个文件的职责。
- 前端改动点。
- 后端改动点。
- API 是否变化。
- 数据库是否变化。
- 类型是否变化。
- 测试命令和结果。
- 是否存在可继续拆分或优化的地方。
- 若有未完成验收项，明确列出。
```

## 开发者验收入口

实现完成后，以 `acceptance-cases.md` 为验收清单逐项核对。任何未覆盖项都必须说明原因、风险和后续处理方案。
