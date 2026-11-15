# 后台资源列表与对局导入调整

本轮只验收桌面端。资源列表优先让操作保持可见、长文本不挤占相邻字段；模型按供应商在同一工作区切换；导入完成后使用统一对局记录。

## 行为

- 音色名称与标识分行，音色主列约占 48%，风格省略显示；试听、编辑、删除同排。
- 模型名称与标识分行，输出上限、备用模型、状态和操作分列。存在额度耗尽模型时操作列增至 300px，容纳重新启用按钮。
- 玩家合并头像与姓名，缩短人设显示，模型和音色有独立列宽，发言设置分行；编辑、删除同排。
- 模型工作区左侧搜索和切换供应商，右侧列表可收起。每个已访问列表保留筛选、分页和滚动位置；收起回到供应商目录后可重新展开。
- 导入对局从列表打开弹窗，保留上传、模板、原文校对、阵容设置、静音预览。完成导入后关闭弹窗并筛选导入来源，没有独立导入记录入口。失败重试复用已保存版本。
- 对局列表增加来源列及筛选，`importTitle` 非空为导入，其余按 `debug` 分为调试和正常。旧导入地址兼容打开弹窗。

## 文件与职责

路径相对仓库根目录。

| 本轮操作 | 文件 | 职责 |
| --- | --- | --- |
| 新增 | `packages/admin/src/features/resources/ResourcePage.css` | 通用表格操作同排、名称与副标题省略样式 |
| 新增 | `packages/admin/src/features/resources/ProviderNavigation.tsx` | 左侧供应商查找、选择及管理入口 |
| 新增 | `packages/admin/src/features/resources/ProviderModelPanel.tsx` | 单供应商筛选状态、滚动恢复和添加模型弹窗组合 |
| 新增 | `packages/admin/src/features/replay-imports/ReplayImportModal.tsx` | 对局导入弹窗、保存发布与重试流程 |
| 修改 | `packages/admin/src/features/resources/ResourcePage.tsx` | 复用列表增加操作列宽、固定列和最小表格宽度配置 |
| 修改 | `packages/admin/src/features/resources/SourceVoices.tsx` | 音色列宽及长文本展示 |
| 修改 | `packages/admin/src/features/resources/ModelsPage.tsx` | 模型列宽、操作区和供应商计数刷新 |
| 修改 | `packages/admin/src/features/resources/ModelActions.tsx` | 模型测试与重新启用按钮同排 |
| 修改 | `packages/admin/src/features/resources/PlayersPage.tsx` | 玩家列组合、列宽及筛选 |
| 修改 | `packages/admin/src/features/resources/ProvidersPage.tsx` | 供应商目录复用与模型面板入口 |
| 修改 | `packages/admin/src/features/resources/ModelManagementPage.tsx` | 工作区布局、访问过的模型面板与各供应商查询状态 |
| 修改 | `packages/admin/src/features/resources/ModelManagement.css` | 桌面供应商导航、列表面板和独立滚动容器 |
| 修改 | `packages/admin/src/app/router.tsx` | 模型可选参数路由与旧导入地址跳转 |
| 修改 | `packages/admin/src/features/matches/pages/MatchListPage.tsx` | 导入弹窗开关、来源列和来源筛选 |
| 修改 | `packages/admin/src/services/matches.ts` | 对局来源查询参数类型与请求序列化 |
| 修改 | `packages/server/src/modules/matches/validator.ts` | 来源参数枚举校验 |
| 修改 | `packages/server/src/modules/matches/controller.ts` | 向服务传递来源查询条件 |
| 修改 | `packages/server/src/modules/matches/repository.ts` | 在数据库分页前按来源过滤 |
| 修改 | `packages/server/test/replayImport.test.ts` | 覆盖三类来源、分页及非法参数 |
| 修改 | `docs/project-admin.md`、`docs/project-server.md`、`docs/replay-import.md` | 更新布局、接口和导入流程说明 |
| 删除 | `packages/admin/src/features/resources/ProviderModelsPage.tsx` | 原独立模型页，由工作区面板承担 |
| 删除 | `packages/admin/src/features/replay-imports/ReplayImportPage.tsx`、`ReplayRecords.tsx` | 原独立导入页与导入记录界面 |
| 新增 | 本文 | 变更职责与验收记录 |

## 接口、数据与验证

`GET /api/admin/matches` 增加可选 `source=normal|debug|import`，沿用 `status`、`limit`、`offset` 和旧 `debug` 参数。响应结构沿用现有 `importTitle`、`debug`；未新增数据库迁移或共享 DTO 字段。前端请求和内部查询类型增加来源枚举。

- 管理后台及服务端 TypeScript 检查通过。
- 管理后台 6 个测试文件、17 项测试通过。
- 导入服务 5 项数据库集成测试通过，包括真实路由的来源过滤与分页校验。
- Playwright 使用模拟 API，在 1440、1920、2560 宽度检查三个列表，页面均无横向溢出，所有行的操作按钮同排且位于视口内。
- 浏览器交互验证通过收起与重开、供应商切换、搜索、分页和滚动保留、新增模型弹窗、旧模型地址、失效供应商、导入弹窗、发布失败重试、导入来源记录及旧导入地址。未调用真实模型或云端语音。
- 证据位于 `tmp/admin-resource-qa/`，包含三个列表截图、导入弹窗截图和 `results.json`。验证脚本为 `tmp/admin-resource-qa.cjs`，工作区临时产物不提交。

后续若资源规模增大，可将各模型面板的模型查询提升为工作区共享缓存；当前按访问过的面板保留组件状态，无需增加新依赖。
