# Azure TTS 字幕接入与实测（2026-11-14）

Azure Speech SDK 会在合成音频时返回 WordBoundary：文字、音频偏移和持续时间。本次把这些真实时间映射到现有逐句字幕；正文仍取当前可见事件并移除朗读标签，分句由系统完成，时间取 Azure。同次请求取得 MP3 与边界事件，不增加语音识别或模型调用。

## 实测结果

区域：当前配置的 `eastasia`。SDK：`microsoft-cognitiveservices-speech-sdk` 1.53.0。样本为：

```text
先核对刚才的发言。[长停][放慢]我们再讨论今天的投票。
```

当前启用玩家绑定的 13 个不同音色，每个实际合成一份音频，全部返回 13 个字词/标点边界，并完整对齐成两句字幕。下面时间均来自同次合成的 Azure 元数据，单位毫秒。

| 音色 | 第一句结束 | 第二句开始 | 第二句结束 |
| --- | ---: | ---: | ---: |
| zh-CN-XiaoxiaoNeural | 1800 | 3159 | 5335 |
| zh-CN-YunzeNeural | 1788 | 3146 | 5617 |
| zh-CN-Yunxi:DragonHDFlashLatestNeural | 1510 | 2502 | 4243 |
| zh-CN-YunyangNeural | 1800 | 3159 | 5365 |
| zh-CN-Yunhan:DragonHDFlashLatestNeural | 1350 | 2352 | 4281 |
| zh-CN-YunfengNeural | 1588 | 2946 | 4932 |
| zh-CN-XiaochenMultilingualNeural | 2088 | 3070 | 5673 |
| zh-CN-Xiaoxiao2:DragonHDFlashLatestNeural | 1750 | 2752 | 4587 |
| zh-CN-XiaoyanNeural | 1763 | 3121 | 5415 |
| zh-CN-Xiaoxiao:DragonHDFlashLatestNeural | 1670 | 2652 | 4487 |
| zh-CN-Yunyi:DragonHDFlashLatestNeural | 1830 | 2802 | 5014 |
| zh-CN-YunxiNeural | 1875 | 3234 | 5263 |
| zh-CN-XiaomengNeural | 1825 | 3184 | 5669 |

停顿还会叠加音色本身的句间停顿，不把 `[长停]` 的 900ms 简单累加到估算时间。放慢后的第二句也使用实际合成返回的边界。

证据保存在本地忽略目录 `artifacts/azure-captions-20261114/`：`0` 至 `12` 的 MP3/JSON、`summary.json`，另有经过真实业务缓存的 `cached.mp3` 与 `cache.json`。JSON 包含原始边界及最终字幕时间轴，不包含密钥。

## 播放与兼容

- Azure 音频使用 `AudioRef.captions`，每句包含清理后的正文及 `startMs`、`endMs`。
- 播放器按音频 `currentTime` 选句。倍速改变播放速度，时间戳仍指向原始音频时间轴。句间保留上一句，下一句到起读时间才出现。
- 静音后改为按文字停留；旧音频、其他供应商或无法完整对齐的元数据继续使用原有估算。不会把部分对齐结果当成精确字幕。
- 音频与字幕在同一事务缓存。跨实例等锁后的查询使用同一个事务连接，避免连接池只有一个连接时再次申请连接。
- 新增迁移 `021_media_captions`（可空 JSONB 字段），已在本地开发库应用。Azure 缓存签名含 `captions-v1`，保留旧音频，新请求按新签名生成，首次可能重新合成。
- 字幕切换还受浏览器媒体进度事件调度影响；本次不是硬实时延迟测量，也没有做人工逐字听校。

## 验证

55 项定向测试通过：Azure SDK 单位转换、超时与关闭连接、文本完整对齐、停顿、重复词、错误元数据降级、试听 HTTP、音频缓存、跨实例缓存与前端播放进度。另有 77 项舞台、布局和实时流/回放回归通过，合计 132 项。

六个包的源码和 shared/engine/games 测试配置共 9 份 TypeScript 检查全部通过，前台和后台生产构建通过（仍有现有的大分块提示）。`pnpm check` 被 shared 内残留的 TypeScript 6 启动链接阻断，实际检查使用根目录 TypeScript 7 的 `node node_modules/typescript/bin/tsc -p <配置>` 逐项执行，未改动包管理器生成的旧链接。

ego-browser 中挂载实际 `useSentenceCaption`、`SegmentControl` 与 `playAudio`，播放真实缓存 MP3，完成正常播放、播放中切换 2 倍速、静音停留。另做 8 项浏览器边界检查：0ms 不抢显示正文，50ms 第一句，2500ms 与 3158ms 仍是第一句，3159ms 才到第二句，倍速不缩放时间戳，静音回退，旧音频按比例回退。证据为 `browser.json` 与 `browser-boundaries.json`。录制帧受后台调度影响，不能用该录制推算前台显示延迟。

## 本次文件与职责

| 状态 | 文件 | 职责 |
| --- | --- | --- |
| 新增 | `packages/server/src/modules/tts/azureTransport.ts` | SDK 请求、MP3 和原始字词时间戳、超时及连接释放 |
| 新增 | `packages/server/src/modules/tts/azureCaptions.ts` | 完整正文对齐及字幕时间轴转换 |
| 新增 | `packages/shared/src/captionText.ts` | 前后端共用分句与长句切分 |
| 新增 | `packages/server/src/db/migrations/021_media_captions.ts` | 可空字幕缓存字段 |
| 新增 | `packages/server/test/azureCaptions.test.ts`、`azureTransport.test.ts` | 对齐和 SDK 生命周期测试 |
| 新增 | `scripts/dev/azure-voice-probe/captions.ts`、`caption-cache.ts` | 真实音色和业务缓存验证 |
| 新增 | 本文档 | 实测结果、边界和变更清单 |
| 修改 | `packages/server/src/modules/tts/azure.ts`、`types.ts` | 组合 SDK 与字幕转换，扩充合成结果 |
| 修改 | `packages/server/src/modules/tts/repository.ts`、`service.ts` | 音频与字幕原子保存、缓存读回 |
| 修改 | `packages/server/src/db/schema.ts`、`migrate.ts` | 数据库类型及迁移注册 |
| 修改 | `packages/shared/src/api/matches.ts`、`index.ts` | 可选字幕协议和导出 |
| 修改 | `packages/client/src/features/game-stage/playback/captions.ts`、`media.ts`、`segment.ts` | 原始音频毫秒位置与选句 |
| 修改 | `packages/client/src/features/game-stage/hooks/useSentenceCaption.ts`、`components/SentenceCaptions.tsx` | 实际时间轴优先，估算回退，标签不显示 |
| 修改 | server 的 `azureSpeech.test.ts`、`realtimeUnit.test.ts`、`multiInstance.test.ts`；client 的 `captions.test.ts`、`playback.test.ts` | 业务缓存、HTTP、跨实例、播放及字幕回归 |
| 修改 | `packages/server/package.json`、`pnpm-lock.yaml` | 官方 SDK 依赖 |
| 修改 | `docs/project-server.md`、`project-client.md`、`project-shared.md` | 契约和播放行为同步 |

没有删除业务文件。管理端界面与现有 HTTP 路径不变；试听响应和 WebSocket 的音频引用新增可选字幕字段，共享类型与数据库因此扩展。已补充本次必要测试。逐字高亮或字幕文件导出可以另行增加，本次继续使用现有逐句界面。

官方依据：[TTS 合成事件](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-speech-synthesis)、[JavaScript WordBoundary 事件参数](https://learn.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/speechsynthesiswordboundaryeventargs?view=azure-node-latest)。
