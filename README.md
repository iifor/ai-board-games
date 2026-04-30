# 共识迷雾

Vite + React + Express 的 AI 隐藏阵营桌游原型。前端负责可视化，后端负责主持人调度多个 AI 玩家。

## 启动

安装依赖：

```powershell
npm.cmd install
```

开发模式：

```powershell
npm.cmd run dev
```

访问：

```text
http://localhost:5173
```

## 多供应商配置

统一入口是根目录的 `ai.config.json`。你可以给主持人和每个玩家配置不同供应商、不同模型。

```json
{
  "providers": {
    "openai": {
      "baseUrl": "https://api.openai.com/v1",
      "apiKeyEnv": "OPENAI_API_KEY"
    },
    "deepseek": {
      "baseUrl": "https://api.deepseek.com",
      "apiKeyEnv": "DEEPSEEK_API_KEY"
    },
    "qwen": {
      "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
      "apiKeyEnv": "QWEN_API_KEY"
    }
  },
  "host": {
    "provider": "deepseek",
    "model": "deepseek-chat"
  },
  "players": [
    { "id": 1, "provider": "openai", "model": "gpt-4o-mini" },
    { "id": 2, "provider": "deepseek", "model": "deepseek-chat" },
    { "id": 3, "provider": "qwen", "model": "qwen-plus" }
  ]
}
```

密钥放在 `.env`，不要写进 `ai.config.json`：

```env
OPENAI_API_KEY=你的OpenAI key
DEEPSEEK_API_KEY=你的DeepSeek key
QWEN_API_KEY=你的通义千问 key
```

是否使用 Mock 不写在 `.env` 或 `ai.config.json` 里，由页面右上角的 Mock / 真实开关决定。

`providers` 只是供应商字典，可以多配，也可以暂时不用。只有 `host` 和 `players` 实际引用到的 provider 才会检查 API Key。真实模式下，如果实际使用的 provider 缺少 key，后端会明确报错；Mock 模式不需要任何 key。

## 诊断接口

查看当前配置：

```text
http://localhost:3001/api/health
```

返回里的 `modeControl` 会显示 `frontend-query`，表示模式由前端开关决定；`realReady` 表示真实模式所需 key 是否齐全。

诊断全部供应商：

```text
http://localhost:3001/api/diagnostics/openai
```

诊断指定供应商：

```text
http://localhost:3001/api/diagnostics/openai?provider=deepseek
http://localhost:3001/api/diagnostics/openai?provider=qwen
```

如果出现 `Connect Timeout Error`，说明 Node 进程连不到对应 provider 的 `baseUrl`，通常是网络、代理、中转地址或防火墙问题，不是游戏调度逻辑问题。

## Web 玩法

页面右上角有 Mock / 真实开关。

- Mock 模式：走本地模拟数据。
- 真实模式：页面先显示“游戏即将开始...”，点击开始后才会调用后端。
- 后端通过 WebSocket 逐步推送游戏状态：

```text
ws://localhost:3001/ws/game
```

## 项目结构

```text
admin/
├── index.html
└── src/
    ├── main.jsx
    ├── api/
    ├── components/
    └── styles.css

client/
├── index.html
└── src/
    ├── main.jsx
    ├── api/
    ├── components/
    ├── utils/
    └── styles.css

server/
├── index.js
├── app.js
├── routes/
├── utils/
├── db.js
├── adminStore.js
├── aiConfig.js
├── aiGameRunner.js
├── openaiChat.js
└── mockGame.js

vite.client.config.mjs
vite.admin.config.mjs
```
