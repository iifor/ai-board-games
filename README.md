# AI Board Games

通用 AI 对战平台：用 TypeScript 声明一个游戏的流程、规则和提示词，由引擎调度 AI 玩家完成对局，C 端实时播放与回放，B 端配置模型与玩家、查看 Trace 并调试。

已有游戏：AI 辩论赛、AI 狼人杀（多个板子）。

## 本地运行

```bash
pnpm install
pnpm db:up            # 本机 PostgreSQL 16（127.0.0.1:5433）
cp .env.example .env  # 填写 JWT_SECRET、SECRET_KEY、ADMIN_USERNAME、ADMIN_PASSWORD 等
pnpm dev              # server :3100、client :5173、admin :5174
```

首次打开后台（http://localhost:5174）用 `.env` 中的账号登录并修改初始密码，然后在后台配置模型供应商、模型、音色与 AI 玩家；也可以用演示数据：

```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD=<修改后的密码> pnpm dev:seed -- --matches
```

演示数据使用占位模型供应商，只能运行"脚本化"的调试局（不调用模型）；要让 AI 真正对战，请在后台把供应商替换为可用的 OpenAI 兼容接口。

旧版（`legacy-final`）的配置可以这样迁移：内置音色目录（Azure 63 个、Mimo 12 个、浏览器 2 个）和旧 SQLite 里的 12 名 AI 玩家人设（`scripts/dev/legacy/players.json`）：

```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD=<修改后的密码> pnpm dev:import-legacy
```

音色目录也可以在后台"音色"页点"导入默认音色"。旧版数据库里的供应商、模型与 API Key 不在本仓库中，需要在后台重新配置。

## 检查与测试

```bash
pnpm check
pnpm test   # 服务端集成测试需要本机 PostgreSQL
```

## 文档

从 [docs/README.md](docs/README.md) 开始阅读。设计与实施计划见 `docs/superpowers/`。
