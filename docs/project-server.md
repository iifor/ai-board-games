# 服务端（packages/server）

> 状态：P3 完成服务端基础（配置、迁移、错误处理、鉴权、资源管理、游戏目录）。P4 加入对局运行时、AI 调用、TTS 与实时推送。

## 技术选型

Node 22 LTS + Hono（HTTP 与 WebSocket）+ Kysely（pg，类型安全 SQL 构建器，CamelCasePlugin 映射 snake_case 列）。开发运行用 `tsx`。选型理由见设计文档"服务端选型"。

前后端契约：请求与响应 DTO 定义在 `@battle/shared` 的 `api/*`，服务端 zod 校验 schema 以 `satisfies z.ZodType<Dto>` 与之绑定，前端 `services/` 直接使用这些类型（不使用 `hono/client` 推断，契约显式、可读）。

## 目录与分层

```txt
src/
  index.ts          入口：加载配置 → 连接数据库 → 迁移 → 初始化管理员 → 启动 HTTP，处理优雅关闭
  app.ts            路由装配与全局中间件
  container.ts      组合根：创建 repository / service 并注入依赖
  types.ts          Hono 上下文类型（requestId、admin）
  config/env.ts     环境变量校验（错误信息不含取值）
  db/               Kysely 实例、表类型、迁移（db/migrations/*.ts，在 db/migrate.ts 登记）
  middlewares/      requestId、管理员鉴权、统一错误处理
  utils/            统一响应、业务错误、参数校验、加密、日志、通用 CRUD controller/routes
  modules/<name>/   repository / service / controller(或经 utils/crud) / routes / validator
```

- controller 只解析参数、调用 service、包装响应；service 承载业务规则（引用检查、加密、默认值）；repository 只做数据库访问。
- 资源型模块复用 `utils/crud.ts` 的标准 controller 与 REST 路由，避免四份重复代码。

## 接口

统一响应：成功 `{ code: 0, message: 'ok', data }`；失败 `{ code, message }`，错误码见 `@battle/shared` 的 `API_ERROR_CODES`（40001 参数、40101 未登录、40301 需先改密、40401 不存在、40901 冲突、42901 过于频繁、50000 内部错误）。未知错误只返回通用信息，详情写服务端日志（含 requestId，响应头 `X-Request-Id`）。数据库唯一约束与外键错误转换为 409，不暴露约束名。

| 方法与路径 | 说明 | 鉴权 |
| --- | --- | --- |
| `GET /api/health` | 数据库可用返回 ok，否则 503 | 无 |
| `GET /api/toc/games` | 游戏目录（来自注册表，含变体/板子） | 无 |
| `GET /api/toc/players` | 启用的玩家公开信息（id、name、avatar、persona） | 无 |
| `POST /api/admin/auth/login` | 登录，返回 JWT（12 小时）与是否需改密 | 无 |
| `POST /api/admin/auth/password` | 修改密码（新密码至少 12 位） | 登录（允许未改密） |
| `GET /api/admin/auth/me` | 当前管理员 | 登录（允许未改密） |
| `GET/POST /api/admin/providers`，`GET/PUT/DELETE /api/admin/providers/:id` | 模型供应商 | 管理员 |
| 同上 `/api/admin/models` | 模型（供应商、备用模型引用检查） | 管理员 |
| 同上 `/api/admin/voices` | 音色（azure / mimo / browser） | 管理员 |
| 同上 `/api/admin/players` | AI 玩家（模型、音色引用检查） | 管理员 |

## 鉴权

- 管理员表为空时，用 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 创建首个账号（必须改密）；已有账号时环境变量不会覆盖。未配置时只记录警告。
- 密码用 scrypt（随机盐）存储；JWT 用 HS256 + `JWT_SECRET`，每次请求从数据库读取账号最新状态。
- 未改初始密码的账号只能访问改密与 `me` 接口，其余后台接口返回 40301。
- 同一用户名 15 分钟内失败 10 次后锁定登录（进程内计数）。

## 密钥

模型供应商的 API Key 用 AES-256-GCM 与 `SECRET_KEY`（32 字节 base64）加密存储，另存末 4 位掩码用于展示；接口永不返回明文，只有服务端内部的 `providers.credentials()` 会解密（供 P4 调用模型）。

## 数据库

PostgreSQL 16，连接时通过 `search_path` 指定 `DATABASE_SCHEMA`（默认 public）。启动时自动执行迁移，失败则拒绝启动。

| 表 | 说明 |
| --- | --- |
| `admin_users` | 管理员 |
| `model_providers` | 供应商（加密的 API Key + 掩码） |
| `models` | 模型参数、备用模型（自引用，删除时置空） |
| `voices` | 音色 |
| `players` | AI 玩家（模型删除受限，音色删除时置空） |

## 配置

见 `.env.example`：`PORT`（默认 3100）、`DATABASE_URL`、`DATABASE_SCHEMA`、`DATABASE_POOL_MAX`、`JWT_SECRET`（≥32 字符）、`SECRET_KEY`、`ADMIN_USERNAME`、`ADMIN_PASSWORD`（≥12 字符）。`pnpm --filter @battle/server dev` 读取根目录 `.env`。

## 测试

`packages/server/test/`：集成测试连接真实 PostgreSQL（`TEST_DATABASE_URL`，默认本机开发库 `127.0.0.1:5433`），每个测试文件创建独立 schema 并在结束时删除；通过 `app.request()` 发起请求，无需监听端口。CI 中由 PostgreSQL service 提供数据库。

## 与引擎的关系

服务端只通过 `@battle/engine` 公开 API 驱动对局：保存 `advance` 返回的快照，推送 `stageEvents`，把 `aiRequests` 交给 AI worker，再把模型输出以 `ai_result` / `ai_failed` 交回。规则、合法性与胜负全部在引擎内完成，服务端不做任何游戏判断。
