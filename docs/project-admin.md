# B 端（packages/admin）

> 状态：P6 完成登录与改密、资源管理、对局列表与详情（调试、阶段图、Trace、完整日志）、创建调试局。

## 技术

React 19 + Vite 8 + react-router 7 + antd 6（中文语言包）。开发端口 `5174`，`/api` 代理到 `http://127.0.0.1:3100`。

## 路由

| 路径 | 页面 |
| --- | --- |
| `/login` | 登录 |
| `/password` | 修改密码（首次登录强制进入） |
| `/matches` | 对局列表（按状态、调试/公开筛选）、删除、创建调试局 |
| `/matches/:matchId` | 对局详情：状态与进度、调试指令、阶段图、Trace、完整日志 |
| `/players` | AI 玩家 |
| `/providers` | 模型供应商：模型数、按供应商跳到模型列表 |
| `/models` | 模型：按供应商 / 状态筛选（`?providerId=` 预选）、关键字搜索、连接测试、额度耗尽状态与重新启用 |
| `/voices` | 音色：来源 / 语言 / 性别 / 状态筛选、关键字搜索、试听、导入默认音色 |

## 目录

```txt
src/
  app/            App（ConfigProvider + antd App + AuthProvider）、路由、后台布局（侧边菜单）
  components/     ListFilterBar（关键字 + 下拉筛选栏）
  hooks/useAsync  数据加载三态与 reload
  services/       tokenStore（localStorage，不可用时退化为内存）、http（附带令牌；401 清除令牌并通知、40301 通知改密）、auth、resources（CRUD 与 modelActions / voiceActions）、matches
  utils/format    formatTime（zh-CN、24 小时制）；对局标题（"游戏 · 板子"）用 @battle/shared 的 formatMatchTitle，与 C 端共用
  features/
    auth/         AuthContext、LoginPage、ChangePasswordPage、RequireAuth
    resources/    ResourcePage（通用列表 + 筛选 + 新建/编辑弹窗 + 删除 + 行操作/标题栏扩展）、utils（客户端筛选）、StatusTag（启用 / 停用，四个资源页共用）、四个资源页面配置，
                  ModelActions（测试 / 重新启用）、VoiceFormFields、VoiceActions（试听 / 导入默认音色）、playback（音频与浏览器朗读）
    matches/      列表、详情、TracePanel、LogPanel、DebugControls、PhaseGraph、CreateDebugMatchModal、useMatchDetail、utils（状态标签、对局类型文案、日志描述、进度标记）
```

## 约定

- 登录态：令牌存在 `tokenStore`，账号信息（含是否需改密）以 `GET /api/admin/auth/me` 为准；接口返回 401 时清除令牌回到登录页，返回 40301 时进入改密页。受保护页面与改密页都先等 `auth.loading` 结束再决定跳转，刷新不会闪一下登录页。
- 资源管理复用 `ResourcePage`：每个资源只提供列定义、表单字段、DTO 与表单值的转换，以及可选的搜索字段、下拉筛选（在客户端过滤，资源量级为数十到数百条）、行操作与标题栏操作。业务校验（引用存在、唯一名称、删除受限）以服务端为准，错误信息直接提示。供应商的 API Key 只写不读，编辑时留空表示不修改。
- 模型："测试"真实调用一次模型（`POST /models/:id/test`），结果以提示展示（成功含耗时与是否为 JSON 输出，失败含原因）。被系统因额度耗尽停用的模型显示"额度已用完"与时间，"重新启用"先测试，通过后以 `enabled: true` 保存。
- 音色：云端音色"试听"调用 `POST /voices/:id/preview` 得到 `/api/media/:id` 后播放；浏览器音色直接用 `speechSynthesis` 朗读。"导入默认音色"把内置目录（Azure 63、Mimo 12、浏览器 2）写入，已存在的跳过。
- 对局详情未结束时每 2 秒只轮询详情；完整日志与 AI 调用（带六层提示词与原始回复，体积大）只在事件进度 `lastSeq` 或状态变化时重新拉取（`progressChanged`），调试指令执行后强制全量刷新。
- 调试：调试局暂停时可单步、继续、跳过、连续运行；阶段图来自 `GET /api/admin/games/:key/phases`，高亮当前阶段。创建调试局可选种子、断点（含"全部阶段"）、推进节奏（连续生成 / 按观众确认）、脚本化，以及只在脚本化打开时可用的"混沌脚本"（弃票 / 放弃 / 自爆 / 非法输出 / 模拟调用失败，用于检查舞台对这些情况的呈现；关掉脚本化会一并关掉它）。列表与详情的类型文案由 `matchTypeLabel` 统一给出：公开 / 调试 / 调试 · 脚本化 / 调试 · 脚本化 · 混沌。
- Trace：每次模型调用按 L1–L6 展示提示词，以及原始响应、解析结果、错误与耗时，可只看失败调用。完整日志包含私密、阵营与 host 频道（兜底记录），可按频道筛选或只看兜底。
- 名为"主持人"的音色用于 C 端主持播报的语音合成。

## 测试

日志描述、对局类型文案、令牌与鉴权事件处理（mock fetch）、Trace 面板静态渲染。登录后的页面交互（含创建调试局弹窗）没有做浏览器端到端测试；对应接口由服务端集成测试覆盖。
