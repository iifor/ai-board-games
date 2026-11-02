import type { VoiceGender, VoiceInput } from '@battle/shared';

// 内置音色目录，沿用旧实现的默认语音包；通过后台"导入默认音色"或 scripts/dev/import-legacy.mjs 写入，按（来源、音色名、风格）去重。

type AzureRow = readonly [language: string, voiceName: string, gender: VoiceGender, description: string, style?: string];
type MimoRow = readonly [voiceName: string, gender: VoiceGender, styleName: string, style: string];

const AZURE_SAMPLE = '你好，我正在为这局游戏进行语音试听。';
const MIMO_SAMPLE = '你好，我正在使用 Mimo 中文语音包进行试听。';

const AZURE_ROWS: readonly AzureRow[] = [
  ['yue-CN', 'yue-CN-YunSongNeural', '男', '粤语（简体）男声'],
  ['zh-CN', 'zh-CN-Xiaoxiao:DragonHDFlashLatestNeural', '女', '普通话 HD Flash 女声', 'cheerful'],
  ['zh-CN', 'zh-CN-Xiaoxiao2:DragonHDFlashLatestNeural', '女', '普通话 HD Flash 女声 2', 'cheerful'],
  ['zh-CN', 'zh-CN-Xiaochen:DragonHDLatestNeural', '女', '普通话 HD 女声'],
  ['zh-CN', 'zh-CN-Yunxiao:DragonHDFlashLatestNeural', '男', '普通话 HD Flash 男声'],
  ['zh-CN', 'zh-CN-Yunyi:DragonHDFlashLatestNeural', '男', '普通话 HD Flash 男声', 'game-narrator'],
  ['zh-CN', 'zh-CN-Yunfan:DragonHDLatestNeural', '男', '普通话 HD 男声'],
  ['zh-CN', 'zh-CN-Xiaoyue:DragonHDOmniLatestNeural', '女', '普通话 HD Omni 女声'],
  ['zh-CN', 'zh-CN-Yunqi:DragonHDOmniLatestNeural', '男', '普通话 HD Omni 男声'],
  ['zh-CN', 'zh-CN-XiaoxiaoNeural', '女', '普通话女声', 'cheerful'],
  ['zh-CN', 'zh-CN-YunxiNeural', '男', '普通话男声', 'chat'],
  ['zh-CN', 'zh-CN-YunjianNeural', '男', '普通话男声', 'narration-relaxed'],
  ['zh-CN', 'zh-CN-XiaoyiNeural', '女', '普通话女声', 'cheerful'],
  ['zh-CN', 'zh-CN-YunyangNeural', '男', '普通话男声', 'narration-professional'],
  ['zh-CN', 'zh-CN-XiaochenNeural', '女', '普通话女声', 'livecommercial'],
  ['zh-CN', 'zh-CN-Xiaochen:DragonHDFlashLatestNeural', '女', '普通话 HD Flash 女声', 'debating'],
  ['zh-CN', 'zh-CN-XiaochenMultilingualNeural', '女', '普通话多语言女声'],
  ['zh-CN', 'zh-CN-Xiaohan:DragonHDFlashLatestNeural', '女', '普通话 HD Flash 女声', 'cheerful'],
  ['zh-CN', 'zh-CN-XiaohanNeural', '女', '普通话女声', 'cheerful'],
  ['zh-CN', 'zh-CN-XiaomengNeural', '女', '普通话女声', 'chat'],
  ['zh-CN', 'zh-CN-XiaomoNeural', '女', '普通话女声', 'cheerful'],
  ['zh-CN', 'zh-CN-XiaoqiuNeural', '女', '普通话女声'],
  ['zh-CN', 'zh-CN-XiaorouNeural', '女', '普通话女声'],
  ['zh-CN', 'zh-CN-XiaoruiNeural', '女', '普通话女声', 'calm'],
  ['zh-CN', 'zh-CN-Xiaoshuang:DragonHDFlashLatestNeural', '女', '普通话 HD Flash 童声', 'chat'],
  ['zh-CN', 'zh-CN-XiaoshuangMultilingualNeural', '女', '普通话多语言童声', 'chat'],
  ['zh-CN', 'zh-CN-XiaoshuangNeural', '女', '普通话童声', 'chat'],
  ['zh-CN', 'zh-CN-XiaoxiaoDialectsNeural', '女', '普通话方言女声'],
  ['zh-CN', 'zh-CN-XiaoxiaoMultilingualNeural', '女', '普通话多语言女声', 'cheerful'],
  ['zh-CN', 'zh-CN-XiaoyanNeural', '女', '普通话女声'],
  ['zh-CN', 'zh-CN-Xiaoyi:DragonHDFlashLatestNeural', '女', '普通话 HD Flash 女声', 'cheerful'],
  ['zh-CN', 'zh-CN-Xiaoyou:DragonHDFlashLatestNeural', '女', '普通话 HD Flash 童声', 'chat'],
  ['zh-CN', 'zh-CN-XiaoyouMultilingualNeural', '女', '普通话多语言童声', 'chat'],
  ['zh-CN', 'zh-CN-XiaoyouNeural', '女', '普通话童声'],
  ['zh-CN', 'zh-CN-Xiaoyu:DragonHDFlashLatestNeural', '女', '普通话 HD Flash 女声', 'debating'],
  ['zh-CN', 'zh-CN-XiaoyuMultilingualNeural', '女', '普通话多语言女声'],
  ['zh-CN', 'zh-CN-XiaozhenNeural', '女', '普通话女声', 'cheerful'],
  ['zh-CN', 'zh-CN-YunfanMultilingualNeural', '男', '普通话多语言男声'],
  ['zh-CN', 'zh-CN-YunfengNeural', '男', '普通话男声', 'cheerful'],
  ['zh-CN', 'zh-CN-Yunhan:DragonHDFlashLatestNeural', '男', '普通话 HD Flash 男声', 'cheerful'],
  ['zh-CN', 'zh-CN-YunhaoNeural', '男', '普通话男声', 'advertisement-upbeat'],
  ['zh-CN', 'zh-CN-YunjieNeural', '男', '普通话男声'],
  ['zh-CN', 'zh-CN-Yunxi:DragonHDFlashLatestNeural', '男', '普通话 HD Flash 男声', 'chat'],
  ['zh-CN', 'zh-CN-Yunxia:DragonHDFlashLatestNeural', '男', '普通话 HD Flash 男声', 'cheerful'],
  ['zh-CN', 'zh-CN-YunxiaNeural', '男', '普通话男声', 'cheerful'],
  ['zh-CN', 'zh-CN-YunxiaoMultilingualNeural', '男', '普通话多语言男声'],
  ['zh-CN', 'zh-CN-Yunye:DragonHDFlashLatestNeural', '男', '普通话 HD Flash 男声'],
  ['zh-CN', 'zh-CN-YunyeNeural', '男', '普通话男声', 'cheerful'],
  ['zh-CN', 'zh-CN-YunyiMultilingualNeural', '男', '普通话多语言男声'],
  ['zh-CN', 'zh-CN-YunzeNeural', '男', '普通话男声', 'calm'],
  ['zh-CN-guangxi', 'zh-CN-guangxi-YunqiNeural', '男', '广西口音普通话男声'],
  ['zh-CN-henan', 'zh-CN-henan-YundengNeural', '男', '河南中原官话男声'],
  ['zh-CN-liaoning', 'zh-CN-liaoning-XiaobeiNeural', '女', '东北普通话女声'],
  ['zh-CN-liaoning', 'zh-CN-liaoning-YunbiaoNeural', '男', '东北普通话男声'],
  ['zh-CN-shaanxi', 'zh-CN-shaanxi-XiaoniNeural', '女', '陕西中原官话女声'],
  ['zh-CN-shandong', 'zh-CN-shandong-YunxiangNeural', '男', '山东冀鲁官话男声'],
  ['zh-CN-sichuan', 'zh-CN-sichuan-YunxiNeural', '男', '四川西南官话男声'],
  ['zh-HK', 'zh-HK-HiuMaanNeural', '女', '粤语（香港）女声'],
  ['zh-HK', 'zh-HK-WanLungNeural', '男', '粤语（香港）男声'],
  ['zh-HK', 'zh-HK-HiuGaaiNeural', '女', '粤语（香港）女声'],
  ['zh-TW', 'zh-TW-HsiaoChenNeural', '女', '台湾普通话女声'],
  ['zh-TW', 'zh-TW-YunJheNeural', '男', '台湾普通话男声'],
  ['zh-TW', 'zh-TW-HsiaoYuNeural', '女', '台湾普通话女声'],
];

const MIMO_ROWS: readonly MimoRow[] = [
  ['冰糖', '女', '温和自然', '请用温和、自然、清晰的中文口吻朗读，语速适中，适合日常角色发言。'],
  ['冰糖', '女', '活泼轻快', '请用活泼、轻快、有亲和力的中文口吻朗读，情绪明亮但不要夸张。'],
  ['冰糖', '女', '冷静分析', '请用冷静、克制、逻辑清晰的中文口吻朗读，适合推理和复盘。'],
  ['茉莉', '女', '亲切叙述', '请用亲切、柔和、叙述感强的中文口吻朗读，停顿自然。'],
  ['茉莉', '女', '悬疑旁白', '请用低声、悬疑、带一点紧张感的中文旁白口吻朗读。'],
  ['茉莉', '女', '坚定表达', '请用坚定、清晰、有说服力的中文口吻朗读，适合辩论陈述。'],
  ['苏打', '男', '沉稳男声', '请用沉稳、可靠、节奏稳定的中文男声口吻朗读。'],
  ['苏打', '男', '主持播报', '请用专业、清晰、有主持感的中文口吻朗读，适合流程播报。'],
  ['苏打', '男', '紧张对抗', '请用紧张、警觉、带对抗感的中文口吻朗读，但保持吐字清晰。'],
  ['白桦', '男', '理性推理', '请用理性、克制、推理感强的中文口吻朗读，重点突出判断过程。'],
  ['白桦', '男', '故事讲述', '请用有画面感、节奏舒展的中文故事讲述口吻朗读。'],
  ['白桦', '男', '严肃裁决', '请用严肃、权威、简洁有力的中文口吻朗读，适合裁决和总结。'],
];

/** 从 Azure 音色名提取说话人标识，用于让名称唯一：zh-CN-Xiaoxiao:DragonHDFlashLatestNeural → Xiaoxiao HD Flash */
export function azureSpeaker(voiceName: string): string {
  return voiceName
    .replace(/^[a-z]{2,3}-[A-Z]{2}(?:-[a-z]+)?-/, '')
    .replace(/Neural$/, '')
    .replace(':DragonHDOmniLatest', ' HD Omni')
    .replace(':DragonHDFlashLatest', ' HD Flash')
    .replace(':DragonHDLatest', ' HD');
}

const BROWSER_VOICES: readonly VoiceInput[] = [
  { name: '浏览器中文女声', provider: 'browser', voiceName: 'zh-CN-female', language: 'zh-CN', gender: '女', description: '浏览器本地朗读，优先匹配中文女声' },
  { name: '浏览器中文男声', provider: 'browser', voiceName: 'zh-CN-male', language: 'zh-CN', gender: '男', description: '浏览器本地朗读，优先匹配中文男声' },
];

const AZURE_VOICES: readonly VoiceInput[] = AZURE_ROWS.map(([language, voiceName, gender, description, style = '']) => ({
  name: `Azure ${description}（${azureSpeaker(voiceName)}）`,
  provider: 'azure',
  voiceName,
  language,
  gender,
  style,
  sampleText: AZURE_SAMPLE,
  description: `Azure Speech ${description}。部分 HD / 预览音色可能受 Azure 区域限制。`,
}));

const MIMO_VOICES: readonly VoiceInput[] = MIMO_ROWS.map(([voiceName, gender, styleName, style]) => ({
  name: `Mimo ${voiceName} · ${styleName}`,
  provider: 'mimo',
  voiceName,
  language: 'zh-CN',
  gender,
  style,
  sampleText: MIMO_SAMPLE,
  description: `Mimo TTS 中文音色 ${voiceName}，${styleName}风格。`,
}));

export const DEFAULT_VOICES: readonly VoiceInput[] = [...BROWSER_VOICES, ...AZURE_VOICES, ...MIMO_VOICES];
