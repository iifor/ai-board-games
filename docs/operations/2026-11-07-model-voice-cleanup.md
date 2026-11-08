# 模型与音色清理记录

2026-11-07，对本机开发后台当前配置执行真实调用检查与清理。

| 配置 | 检查前 | 保留 | 删除 |
| --- | --- | --- | --- |
| 模型 | 173 | 16 | 157 |
| 音色 | 77 | 60 | 17 |

15 名玩家均保留，引用已改配到通过验证的模型和音色。所有剩余模型均已启用。

## 供应商清理

按清理后的模型引用，删除了没有可用模型的 8 个供应商配置，包括对应的后台连接信息与凭据。

OpenRouter、智谱AI、混元大模型、Kimi、Cloudflare、魔搭、Github Model、LLM7 已删除。

| 保留供应商 | 可用模型数 |
| --- | --- |
| 阿里百炼 | 11 |
| 火山方舟 | 5 |

删除后重新读取模型与玩家，16 个模型和 15 名玩家的配置均与供应商清理前一致，引用全部有效。供应商清理计划和结果保存在 tmp/configuration-audit/provider-cleanup-plan.json 与 provider-cleanup-result.json。

## 验证方法

- 对每个模型调用后台连接测试，失败后复测。对空内容、非 JSON 与限流项另外检查。
- 对最终保留的每个模型使用已保存的温度和 1024 token 输出上限调用项目 LLM 客户端，确认返回包含目标与理由的有效游戏 JSON。
- 对每个云端音色使用新文本合成，避免复用旧缓存。59 个保留的云端音色均取得音频，并通过 ffprobe 的音轨与时长检查。
- 浏览器默认中文音色使用本机 Microsoft Huihui 完成一段中文朗读。
- 清理后重新读取配置，检查全部玩家与备用模型引用，并使用新的主持文本再次合成语音。

## 保留的模型

| ID | 供应商 | 模型 | 调用耗时 |
| --- | --- | --- | --- |
| 30 | 火山方舟 | deepseek-v4-flash-ga-260731 | 1545ms |
| 45 | 阿里百炼 | qwen3.7-flash-2026-07-15 | 3868ms |
| 51 | 阿里百炼 | deepseek-v4-flash-0731 | 1294ms |
| 91 | 阿里百炼 | qwen3.7-max-2026-06-08 | 1579ms |
| 96 | 阿里百炼 | glm-5.2 | 1965ms |
| 97 | 阿里百炼 | kimi-k2.7-code | 1455ms |
| 114 | 阿里百炼 | qwen3.7-max-2026-05-20 | 1725ms |
| 116 | 阿里百炼 | qwen3.7-plus-2026-05-26 | 11224ms |
| 128 | 阿里百炼 | qwen3.7-max-2026-05-17 | 1157ms |
| 145 | 阿里百炼 | qwen3.5-ocr | 784ms |
| 147 | 阿里百炼 | qwen3.7-flash | 5585ms |
| 153 | 阿里百炼 | qwen3.8-max | 4082ms |
| 156 | 火山方舟 | doubao-seed-2-1-turbo-260628 | 2090ms |
| 157 | 火山方舟 | glm-5-2-260617 | 3711ms |
| 158 | 火山方舟 | doubao-seed-2-1-pro-260628 | 2109ms |
| 162 | 火山方舟 | doubao-seed-character-260628 | 590ms |

## 玩家改配

| 玩家 | 原模型 | 当前模型 | 音色调整 |
| --- | --- | --- | --- |
| 豆包 | Doubao-Seed-2.0-mini | Doubao-Seed-2.1-turbo | 保留原音色 |
| Grok | DeepSeek-V3.2 | DeepSeek-V4-Flash正式版 | 保留原音色 |
| 文心一言 | Doubao-Seed-1.6-flash · 火山方舟 #51 | Doubao-Seed-2.1-turbo | 保留原音色 |
| Gemini | google/gemma-4-31b-it | qwen3.7-flash | 保留原音色 |
| Kimi | kimi-k2.5 | kimi-k2.7-code | 保留原音色 |
| DeepSeek | DeepSeek-V4-flash | DeepSeek-V4-Flash正式版 | 保留原音色 |
| 千问 | qwen3.6-plus | qwen3.7-plus-2026-05-26 | 保留原音色 |
| 元宝 | GLM-4.7 · 火山方舟 | GLM-5.2 | 保留原音色 |
| 讯飞星火 | MiniMax-M2.1 | qwen3.7-flash | 保留原音色 |
| 智谱清言 | GLM-4.7 · 智谱AI | glm-5.2 | 保留原音色 |
| ChatGPT | openai/gpt-4.1 | qwen3.7-flash | 保留原音色 |
| Claude Code | DeepSeek-V4-flash | DeepSeek-V4-Flash正式版 | 保留原音色 |
| Meta | @cf/meta/llama-3.1-8b-instruct | qwen3.7-flash | Grok苏打 - 沉稳男声 → Azure 普通话男声 · zh-CN-YunjianNeural narration-relaxed |
| MiMo | deepseek-v4-flash | deepseek-v4-flash-0731 | 保留原音色 |
| 主持人 | deepseek-v4-flash | deepseek-v4-flash-0731 | Kimi 白桦 - 理性推理 → 主持人（Azure 游戏旁白） |

## 失效配置

| 模型删除原因 | 数量 |
| --- | --- |
| 额度耗尽、余额不足或账号用量上限 | 55 |
| 模型下线或端点关闭 | 8 |
| 模型不存在或账号未获访问权限 | 91 |
| 多次测试仍返回空内容 | 1 |
| 降速复测后仍受请求限制 | 1 |
| 不支持项目使用的聊天接口 | 1 |

语音删除包括 13 个使用失效 API Key 的 Mimo 配置，以及 4 个在当前 Azure 配置下两次返回 400 的 HD 音色。OpenRouter 的 Gemma 在 32 token 的短测试中能返回，但在已保存的 1024 token 配置下因余额不足返回 402，因此纳入删除。

## 主持播报

名为“主持人”的音色使用已通过测试的 Azure zh-CN-Yunyi:DragonHDFlashLatestNeural，保留 game-narrator 风格。Meta 改用 Azure Yunjian 叙述音色，主持人玩家改用同一主持旁白。

## 执行后校验

| 项目 | 结果 |
| --- | --- |
| 剩余模型 | 16 |
| 剩余音色 | 60，其中 59 个 Azure 与 1 个浏览器音色 |
| 玩家总数 | 15 |
| 前台启用玩家 | 13 |
| 玩家与备用模型引用 | 全部有效 |
| 新主持文本生成的音频 | 27504 字节 |

原始配置快照、逐次测试结果、音频解码结果、删除清单和执行日志保存在项目忽略目录 tmp/configuration-audit/。记录未包含管理员密码、API Key 或令牌。项目源代码、API 与数据库表结构未改动。
