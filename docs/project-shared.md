# 共享类型、Schema 与测试

## 项目概述

共享包位于 `packages/shared`，用于沉淀前后端共同依赖的类型、schema、常量、工具和 Vite 插件，减少 API、WebSocket、游戏状态和工作流协议漂移。

## 技术栈

- TypeScript
- zod
- pnpm workspace exports

## 目录结构

```txt
packages/shared/
├── package.json
├── tsconfig.json
├── constants/
│   ├── channelMaps.ts
│   └── gameLimits.ts
├── schemas/
│   ├── gameSchemas.ts
│   ├── gameEngineSchemas.ts
│   ├── skillRegistry.ts
│   └── workflowSchemas.ts
├── types/
│   ├── apiTypes.ts
│   ├── channelTypes.ts
│   ├── gameEngine.ts
│   ├── gameEvent.ts
│   ├── gameTypes.ts
│   ├── speechTypes.ts
│   └── workflowTypes.ts
├── utils/
│   └── channelResolution.ts
└── vite-plugins/
    └── px2vw.mjs

tests/
├── unit/
├── workflow/
└── migration/
```

## 架构设计

共享包通过 `package.json` exports 暴露：

- `@ai-presenter/shared/types/*`
- `@ai-presenter/shared/schemas/*`
- `@ai-presenter/shared/constants/*`
- `@ai-presenter/shared/utils/*`
- `@ai-presenter/shared/vite-plugins/*`

前端和后端都应优先引用共享类型和 schema，避免重复声明协议。

## 核心模块

### 类型

- `apiTypes.ts`：统一 API 响应类型。
- `gameTypes.ts`：游戏类型、游戏状态和通用游戏数据。
- `workflowTypes.ts`：workflow、AI task、pending action、effect、interrupt 等类型。
- `speechTypes.ts`：语音和字幕相关类型。
- `channelTypes.ts`：事件通道和可见性类型。
- `gameEvent.ts`：游戏事件类型。
- `gameEngine.ts`：通用游戏引擎类型。

### Schema

- `gameSchemas.ts`：游戏参数校验 schema。
- `workflowSchemas.ts`：工作流参数校验 schema。
- `gameEngineSchemas.ts`：游戏引擎 schema。
- `skillRegistry.ts`：技能注册相关 schema。

### 常量和工具

- `gameLimits.ts`：游戏限制常量。
- `channelMaps.ts`：事件通道映射。
- `channelResolution.ts`：通道解析工具。
- `px2vw.mjs`：Vite 样式转换插件。

## API 响应约定

推荐统一响应结构：

```ts
{
  code: number | string;
  message: string;
  data?: unknown;
}
```

新增或修改 API 时，应优先在共享类型中定义稳定响应结构，再由前后端共同消费。

## 测试

根目录测试脚本：

```bash
pnpm run test:unit
pnpm run test:workflow
pnpm run test:migration
```

测试目录：

- `tests/unit`：通用单元测试，例如 event bus、game engine contract、socket session、skill event emitter。
- `tests/workflow`：工作流测试，例如狼人杀 reducer/effects/action window、事件投影、辩论发言事件、展示事件。
- `tests/migration`：迁移和事件映射测试。

测试选择建议：

| 改动类型 | 建议命令 |
| --- | --- |
| reducer、effects、action window、事件投影、游戏流程 | `pnpm run test:workflow` |
| shared 类型消费、基础工具、event bus、socket session、skill emitter | `pnpm run test:unit` |
| 数据库迁移、事件映射、历史兼容 | `pnpm run test:migration` |
| 跨包类型或导出调整 | `pnpm run check`，必要时追加相关测试 |

## 扩展点与注意事项

- 前后端共享类型优先放入 `packages/shared/types`。
- 参数校验 schema 优先放入 `packages/shared/schemas` 或服务端模块 validator。
- 常量优先放入 `packages/shared/constants`，除非只服务单个模块。
- 修改共享类型时，需要同步检查 client、admin、server 的引用和测试。
- 不允许用大量 `any` 或 `as any` 掩盖协议不清晰问题；确需使用时必须说明原因。
