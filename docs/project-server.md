# 服务端（packages/server）

> 状态：P0 只有包骨架。P3 实现服务端基础，P4 实现对局运行时，届时补全本文档。

## 职责

- 配置、数据库迁移、统一错误处理、管理员鉴权。
- 模型供应商、模型、音色、AI 玩家的管理 API。
- 对局运行时：事务内调用引擎推进、AI 任务队列与 worker、LLM 与 TTS 调用、Trace 记录。
- 实时网关：按 ACK 节奏推送 StageEvent，支持断线续播与回放。

## 技术选型

Node 22 LTS + Hono（HTTP 与 WebSocket，zod 中间件校验参数，`hono/client` 给前端提供类型化 API）+ Kysely（pg，类型安全 SQL 构建器）。选型理由见设计文档"服务端选型"。

## 与引擎的关系

服务端只通过 `@battle/engine` 公开 API 驱动对局：保存 `advance` 返回的快照，推送 `stageEvents`，把 `aiRequests` 交给 AI worker，再把模型输出以 `ai_result` / `ai_failed` 交回。规则、合法性与胜负全部在引擎内完成，服务端不做任何游戏判断。

## 分层约定

`src/modules/<module>/` 下按 `controller / service / repository / routes / validator / types` 分层；controller 只处理请求响应，service 承载业务逻辑，repository 只做数据库访问。
