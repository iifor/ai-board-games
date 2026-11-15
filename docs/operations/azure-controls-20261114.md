# Azure 当前音色控制实测（2026-11-14）

范围为数据库中启用玩家绑定的 13 个 Azure 音色，包括主持人。区域为 `eastasia`。通过真实 Azure REST 合成 141 段短文本 PCM，使用 16kHz、16-bit 单声道输出。此报告记录客观测量，未包含人工听感验收。

所有音色先测两份基线、一次 1200ms 停顿、语速 -30%/+30%、音高 -20%/+20%。5 个 HD Flash 追加两份基线和每种语速、音高各两份样本。HD 样本在请求中设 `temperature=0.0`，仍观察到输出波动。

正文统一为“先核对刚才的发言，我们再讨论今天的投票。”，保留各音色当前配置风格。停顿插在逗号后。数据与每次实际 SSML 存于 `artifacts/azure-controls-20261114/`，目录不保存密钥。

## 测量与判定

- 时长从 PCM 样本数计算，静音按 10ms RMS 帧测量，排除首尾静音。暂停通过要求内部间隔至少 0.9 秒，并比所有基线最长间隔至少多 0.5 秒。
- 基频用 Praat 自相关算法测量，检测范围 40–600Hz，统计有声帧中位数。低沉男声使用 40Hz 下限，以减少降调后的倍频误判。
- 多份样本取中位数。慢速时长比至少 1.15，快速至多 0.88；降调基频比至多 0.90，升调至少 1.12。重复控制样本至少三分之二方向一致。
- 数字为相对基线的时长或基频比。HD Flash 的比值不表示每次都能精确复现同样幅度，主持人慢速样本尤其有较大波动。

## 结果

| 玩家 | 音色 | 停顿 | 慢/快时长比 | 低/高基频比 | 开放音高 |
| --- | --- | --- | --- | --- | --- |
| 豆包 | XiaoxiaoNeural | 通过 | 1.430 / 0.769 | 0.800 / 1.204 | 是 |
| Grok | YunzeNeural | 通过 | 1.429 / 0.769 | 0.821 / 1.220 | 是 |
| 文心一言 | Yunxi HD Flash | 通过 | 1.302 / 0.687 | 1.079 / 1.080 | 否，方向未确认 |
| Gemini | YunyangNeural | 通过 | 1.430 / 0.769 | 0.787 / 1.199 | 是 |
| Kimi | Yunhan HD Flash | 通过 | 1.455 / 0.814 | 1.081 / 0.874 | 否，方向未确认 |
| DeepSeek | YunfengNeural | 通过 | 1.430 / 0.769 | 0.803 / 1.198 | 是 |
| 千问 | XiaochenMultilingualNeural | 通过 | 1.430 / 0.769 | 0.806 / 1.174 | 是 |
| 元宝 | Xiaoxiao2 HD Flash | 通过 | 1.419 / 0.760 | 1.074 / 0.952 | 否，方向未确认 |
| 智谱清言 | XiaoyanNeural | 通过 | 1.430 / 0.769 | 0.801 / 1.193 | 是 |
| 讯飞星火 | Xiaoxiao HD Flash | 通过 | 1.391 / 0.787 | 0.996 / 1.000 | 否，方向未确认 |
| 主持人 | Yunyi HD Flash | 通过 | 2.120 / 0.747 | 1.252 / 1.096 | 否，方向未确认 |
| ChatGPT | YunxiNeural | 通过 | 1.430 / 0.769 | 0.803 / 1.201 | 是 |
| Claude Code | XiaomengNeural | 通过 | 1.430 / 0.769 | 0.800 / 1.195 | 是 |

13 个音色均开放暂停和变速。8 个普通 Neural 开放音高，5 个 HD Flash 未确认音高参数的稳定方向，因此不提供音高标签，并省略该属性。项目实际预设采用较轻的 ±15% 语速与 ±10% 音高；上述实验用更大幅度以判断能力。

## 接入与复测

`azureControlCapabilities.ts` 按完整音色名与区域保存本次能力结果。对未测音色或区域，精确控制默认不开放；官方 `StyleList` 仍可提供已登记中文名称的风格。音色名带 `Latest`，Azure 后续更新可能改变行为，需要重新运行相同实验后更新结果。

复测命令（在项目根目录执行，使用已配置的 Azure 服务，会产生字符用量）：

```powershell
node --env-file=.env --import ./packages/server/node_modules/tsx/dist/loader.mjs scripts/dev/azure-voice-probe/collect.ts artifacts/azure-controls-20261114
node --env-file=.env --import ./packages/server/node_modules/tsx/dist/loader.mjs scripts/dev/azure-voice-probe/collect.ts artifacts/azure-controls-20261114 --repeat-hd
python scripts/dev/azure-voice-probe/analyze.py artifacts/azure-controls-20261114 --deps tmp/azure-controls-pydeps
```

分析依赖 `numpy` 和 `praat-parselmouth`，后者在本次验证中安装于项目临时目录。复测到新目录可保留原始证据。运行程序不会自动覆盖生产能力配置。

## 联调与文件职责

新链路另合成两段 MP3，位于相同产物目录的 `Neural-控制标签试听.mp3` 和 `HDFlash-控制标签试听.mp3`。两段都通过 `prepare` 完成标签清理，分别使用当前已测的普通 Neural 和 HD Flash 音色。自动回归覆盖标签顺序、恢复、风格别名、音色/区域限制、缓存和模拟模型整局调用。模拟对局用于验证提示词及输出清理，不代表真人游玩或模型自然表达的听感验收。

| 变更 | 文件 | 职责 |
| --- | --- | --- |
| 新增 | `scripts/dev/azure-voice-probe/collect.ts` | 从启用玩家和主持人音色收集真实 Azure 对照合成，保存 SSML 与 PCM |
| 新增 | `scripts/dev/azure-voice-probe/analyze.py` | 合并重复样本，测量静音、时长、基频并写出 JSON，另导出 WAV |
| 新增 | `scripts/dev/azure-voice-probe/demo.ts` | 通过正式适配器合成标签联调试听 |
| 新增 | `packages/shared/src/azureStyles.ts` | 统一中文风格名称、标签和不同官方标识的同义映射 |
| 新增 | `packages/shared/src/speechControls.ts` | 控制标签预设、控制类型和能力筛选 |
| 新增 | `packages/server/src/modules/tts/azureControlCapabilities.ts` | 按区域和完整音色名保存实测控制能力 |
| 新增 | `packages/server/src/modules/ai-worker/speechDelivery.ts` | 为当前座位构造候选列表，清理发言/点评中的越界标记 |
| 新增 | `packages/server/test/speechDelivery.test.ts` | 候选列表、目录故障和 worker 整局调用回归 |
| 新增 | 本报告 | 记录实验方法、结果、限制和复测命令 |
| 修改 | `packages/shared/src/speechTags.ts`、`speechTags.test.ts`、`index.ts` | 解析控制与情绪标签，导出公共类型和函数并验证恢复语义 |
| 修改 | `packages/admin/src/features/resources/voiceStyles.ts` | 复用共享风格显示函数 |
| 修改 | `packages/server/src/modules/tts/azureSpeech.ts` | 校验风格与控制能力，计算分段参数 |
| 修改 | `packages/server/src/modules/tts/azureSsml.ts` | 渲染一次性停顿和有权限的局部 prosody 参数 |
| 修改 | `packages/server/src/modules/tts/azure.ts`、`types.ts`、`service.ts` | 注入区域能力、扩展内部段类型，按最终控制参数寻址缓存 |
| 修改 | `packages/server/src/modules/ai-worker/executor.ts` | 使用实际音色约束调用模型，并记录实际提示词、原始响应和清理结果 |
| 修改 | `packages/server/src/container.ts` | 装配并共享音色目录与朗读适配服务 |
| 修改 | `packages/engine/src/prompt/playerExpression.ts`、`runtime/types.ts` | 表达约定改为遵循当前清单，说明服务端适配边界 |
| 修改 | `packages/server/test/azureSpeech.test.ts` | SSML 控制开关、风格别名和标签移除回归 |
| 修改 | `docs/project-server.md`、`project-shared.md`、`project-engine.md`、`project-admin.md` | 同步模块职责、控制语义和运行约定 |

无删除文件。沿用现有 API 与数据库结构，扩展共享解析和内部 TTS 类型。标签仍计入现有发言字数限制，提示词要求为标记预留字数。后续增加音色时应按同一方法复测，再更新能力数据。
