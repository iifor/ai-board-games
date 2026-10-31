# AI Board Games

通用 AI 对战平台：用 TypeScript 声明一个游戏的流程、规则和提示词，由引擎调度 AI 玩家完成对局，并在前台实时播放与回放。

首版游戏：辩论赛、狼人杀标准 12 人局。

## 快速开始

```bash
pnpm install
pnpm check
pnpm test
```

本机数据库（服务端从 P3 起使用）：

```bash
pnpm db:up
```

## 文档

从 [docs/README.md](docs/README.md) 开始阅读。设计与实施计划见 `docs/superpowers/`。
