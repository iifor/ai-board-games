# 项目总体架构

## 项目概述

通用 AI 对战平台。一个游戏 = `GameSpec`（声明式阶段图）+ 规则纯函数 + 提示词模板；引擎负责流程推进、AI 调度、合法性校验、信息隔离、重试兜底、调试与回放；前台用通用舞台播放对局。

首版游戏：辩论赛、狼人杀标准 12 人局。当前进度见实施计划。

## 技术栈

- pnpm workspace（9.5，使用 catalog 统一依赖版本）、TypeScript 7 strict、zod 4、vitest 5。
- 前端：React 19 + Vite 8；后台另用 antd（P6 引入）。
- 服务端：Express + ws + pg（P3 引入）；数据库 PostgreSQL 16。

## 包结构与依赖方向

```txt
packages/
  shared/   协议：StageEvent、观众视图、游戏目录 DTO、WebSocket 消息的类型与 schema
  engine/   纯运行时：GameSpec、解释器、基础动作、可见性、提示词组装、调试、测试夹具
  games/    游戏定义：每个游戏一个目录（spec、rules、prompts、debug、测试）
  server/   适配层：配置、数据库、鉴权、资源管理、对局运行时、AI 调用、TTS、实时网关
  client/   C 端：大厅、对局舞台、历史与回放
  admin/    B 端：模型与玩家配置、对局列表、Trace、调试台
```

依赖方向：`games → engine → shared`；`server → engine + games + shared`；`client / admin → shared`。

内部包直接导出 TypeScript 源码（`exports: ./src/index.ts`），由 Vite、vitest 和服务端运行时处理编译；服务端生产构建方式在 P8 确定。

## 纯度约束

`engine` 与 `games` 必须是纯运行时，由两层机制强制：

- 类型层：两个包的 `tsconfig.json` 使用 `types: []`，源码里出现 `process`、`setTimeout` 等 Node 全局即类型检查失败。测试另用 `tsconfig.test.json` 检查，允许 Node 类型。
- 测试层：`packages/engine/test/purity.test.ts` 扫描两个包的源码：engine 只允许依赖 `zod`、`@battle/shared`，games 只允许依赖 `zod`、`@battle/engine`；禁止 `Date.now`、`new Date`、`Math.random`、`fetch`、`console`、`require` 与动态 import。

## 命令

| 命令 | 作用 |
| --- | --- |
| `pnpm install` | 安装依赖 |
| `pnpm check` | 各包 TypeScript 检查 |
| `pnpm test` / `pnpm test:watch` | 运行全部 vitest 项目 |
| `pnpm dev` | 并行启动各包的 dev 脚本（目前为 client `5173`、admin `5174`） |
| `pnpm build` | 构建有 build 脚本的包 |
| `pnpm db:up` / `pnpm db:down` | 启动 / 停止本机 PostgreSQL 16（`docker-compose.dev.yml`） |

前端开发服务器把 `/api`（含 WebSocket）代理到 `http://127.0.0.1:3001`。

## 环境变量

见 `.env.example`。本机开发数据库只绑定 `127.0.0.1`，使用 trust 认证，仅限本机开发。

## CI

`.github/workflows/ci.yml`：PR 以及 `master`、`rewrite/**` 分支的 push 触发，执行 install、check、test。P3 起加入 PostgreSQL service。

## 历史

旧实现（按游戏手写 handler 的版本）保留在 git tag `legacy-final`，只作参考，新代码不引用。
