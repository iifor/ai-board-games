# 服务端（packages/server）

> 状态：P0 只有包骨架。P3 实现服务端基础，P4 实现对局运行时，届时补全本文档。

## 职责

- 配置、数据库迁移、统一错误处理、管理员鉴权。
- 模型供应商、模型、音色、AI 玩家的管理 API。
- 对局运行时：事务内调用引擎推进、AI 任务队列与 worker、LLM 与 TTS 调用、Trace 记录。
- 实时网关：按 ACK 节奏推送 StageEvent，支持断线续播与回放。

## 分层约定

`src/modules/<module>/` 下按 `controller / service / repository / routes / validator / types` 分层；controller 只处理请求响应，service 承载业务逻辑，repository 只做数据库访问。
