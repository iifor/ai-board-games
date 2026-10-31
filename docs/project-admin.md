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
| `/players`、`/models`、`/providers`、`/voices` | 资源管理 |

## 目录

```txt
src/
  app/            App（ConfigProvider + antd App + AuthProvider）、路由、后台布局（侧边菜单）
  hooks/useAsync  数据加载三态与 reload
  services/       tokenStore（localStorage，不可用时退化为内存）、http（附带令牌；401 清除令牌并通知、40301 通知改密）、auth、resources、matches
  features/
    auth/         AuthContext、LoginPage、ChangePasswordPage、RequireAuth
    resources/    ResourcePage（通用列表 + 新建/编辑弹窗 + 删除）与四个资源页面配置
    matches/      列表、详情、TracePanel、LogPanel、DebugControls、PhaseGraph、CreateDebugMatchModal、useMatchDetail
```

## 约定

- 登录态：令牌存在 `tokenStore`，账号信息（含是否需改密）以 `GET /api/admin/auth/me` 为准；接口返回 401 时清除令牌回到登录页，返回 40301 时进入改密页。
- 资源管理复用 `ResourcePage`：每个资源只提供列定义、表单字段、DTO 与表单值的转换。业务校验（引用存在、唯一名称、删除受限）以服务端为准，错误信息直接提示。供应商的 API Key 只写不读，编辑时留空表示不修改。
- 对局详情未结束时每 2 秒刷新详情、完整日志与 AI 调用。
- 调试：调试局暂停时可单步、继续、跳过、连续运行；阶段图来自 `GET /api/admin/games/:key/phases`，高亮当前阶段。创建调试局可选种子、断点（含"全部阶段"）、推进节奏（连续生成 / 按观众确认）与脚本化。
- Trace：每次模型调用按 L1–L6 展示提示词，以及原始响应、解析结果、错误与耗时，可只看失败调用。完整日志包含私密、阵营与 host 频道（兜底记录），可按频道筛选或只看兜底。
- 名为"主持人"的音色用于 C 端主持播报的语音合成。

## 测试

日志描述、令牌与鉴权事件处理（mock fetch）、Trace 面板静态渲染。登录后的页面交互没有做浏览器端到端测试；对应接口由服务端集成测试覆盖。
