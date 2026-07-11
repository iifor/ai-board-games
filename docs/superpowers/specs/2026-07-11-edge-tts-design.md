# Edge TTS 接入设计

## 目标

在现有服务端 TTS 管线中新增 `edge` provider，生成可缓存的 MP3 音频和逐词时间边界。Edge 合成失败时继续沿用当前客户端浏览器 TTS 降级，不替换 Azure 或 Mimo。

## 范围

- 新增服务端 Edge TTS 合成适配器。
- 复用现有语音包、音频缓存、媒体事件、字幕、播放和 ACK 管线。
- 增加少量普通话 Edge 默认音色。
- 增加超时配置、单元测试和项目文档。

不修改游戏工作流、WebSocket 消息、REST API、数据库结构、共享事件类型或客户端播放器。不实现多 provider 自动切换、重试队列、熔断器或实时流式播放。

## 技术方案

使用 `@andresaya/edge-tts`，由新增的 `packages/server/modules/tts/edge.ts` 封装第三方 API。适配器接收现有 `VoicePackage` 与文本，输出与 Azure/Mimo 相同的结构：

```ts
{
  buffer: Buffer;
  mimeType: 'audio/mpeg';
  wordBoundaries: Array<{
    offset: number;
    duration: number;
    text: string;
  }>;
}
```

`service.ts` 根据 `provider === 'edge'` 调用适配器；`isServerTtsVoice()` 将 Edge 纳入服务端媒体生成；缓存 key 包含 provider、voiceId、language、rate、pitch 与文本，避免跨音色复用。

## 数据流

1. 服务端展示事件产生 `speakableText` 或玩家发言文本。
2. `game-socket/media.ts` 根据语音包调用现有 `prepareVoiceAudio()`。
3. `service.ts` 将 Edge 语音包分发给 Edge 适配器。
4. 适配器生成 MP3 Buffer 与 word boundaries。
5. 现有缓存保存音频和 boundaries JSON，并把 `audioUrl` 注入事件。
6. 客户端现有 `Audio` 队列播放音频，使用 boundaries 驱动字幕，播放完成后发送 ACK。
7. 合成失败时事件不带 `audioUrl`，客户端使用浏览器 Web Speech API 播放并正常 ACK。

## 错误处理

- 使用 `EDGE_TTS_TIMEOUT_MS`，默认 15 秒。
- 空文本与缺失 `voiceId` 在适配器入口拒绝。
- 上游超时映射为 504，其余上游失败映射为 502。
- 不在适配器内自动重试，避免延长阻塞工作流；现有浏览器 TTS 是最终降级。
- Edge 是非官方服务，不承诺 SLA；项目文档必须记录该限制。

## 默认音色

首版仅预置少量稳定的普通话音色，避免复制完整远程音色列表：

- `zh-CN-XiaoxiaoNeural`
- `zh-CN-XiaoyiNeural`
- `zh-CN-YunxiNeural`
- `zh-CN-YunjianNeural`

沿用现有 `voice_packages` 数据结构，不做数据库迁移。

## 测试

- `edge` 被识别为服务端 TTS provider。
- 缓存 key 能区分 Edge provider、音色、语速和音调。
- Edge 参数正确映射到第三方包。
- word boundary 正确转换为项目毫秒结构。
- 空文本、缺失音色与超时产生明确错误。
- 服务端 TypeScript check 通过。

单元测试不访问真实 Edge 服务，通过注入最小合成客户端验证适配行为。完成后追加一次真实短文本 smoke test；若环境网络受限，明确报告未验证边界。

## 文件职责

- 新增 `packages/server/modules/tts/edge.ts`：Edge 合成与 boundary 转换。
- 新增 `tests/unit/edgeTts.test.ts`：Edge provider 的最小行为测试。
- 修改 `packages/server/modules/tts/service.ts`：provider 分发。
- 修改 `packages/server/modules/tts/utils.ts`：provider 判断与缓存 key。
- 修改 `packages/server/modules/tts/constants.ts`：超时配置。
- 修改 `packages/server/modules/tts/cache.ts`：确认 Edge 使用 MP3 缓存。
- 修改 `packages/server/modules/voices/constants.ts`：默认 Edge 音色。
- 修改 `packages/server/package.json` 与 `pnpm-lock.yaml`：新增依赖。
- 修改 `.env.example` 与 `docs/project-server.md`：配置和运维约定。

## 验收标准

- 管理端可创建或选择 `provider: edge` 的语音包并试听。
- 实际游戏事件能收到可播放的 Edge MP3 URL。
- 有 boundary 时字幕随音频时间推进；无 boundary 时整句字幕仍正常。
- Edge 不可用时游戏流程不失败，客户端回退浏览器 TTS 并继续 ACK。
- Azure、Mimo 和 browser provider 行为不变。
