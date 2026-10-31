# 共享协议（packages/shared）

> 状态：P0 只有包骨架。P1 起加入 StageEvent、观众视图与游戏目录 DTO，届时补全本文档。

## 职责

- 前后端共享的协议类型与 zod schema：StageEvent、观众视图、游戏目录、WebSocket 消息。
- 只放协议，不放业务逻辑；不依赖任何运行时环境（浏览器与 Node 都可使用）。

## 测试约定

- 所有包统一使用 vitest，测试文件与源码同目录，命名 `*.test.ts(x)`；engine 的跨包纯度测试放在 `packages/engine/test/`。
- 根目录 `vitest.config.ts` 以 `packages/*` 为项目列表，各包的 `vitest.config.ts` 声明项目名与运行环境。
