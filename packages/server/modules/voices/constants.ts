interface VoicePackageInput {
  name: string;
  provider: string;
  voiceId: string;
  language: string;
  gender?: string;
  style?: string;
  rate?: string;
  pitch?: string;
  temperature?: number;
  sampleText?: string;
  description: string;
  enabled: boolean;
}

const DEFAULT_VOICE_PACKAGES: VoicePackageInput[] = [
  { name: '默认中文女声', provider: 'browser', voiceId: 'zh-CN-female', language: 'zh-CN', description: '浏览器中文女声优先匹配', enabled: true },
  { name: '默认中文男声', provider: 'browser', voiceId: 'zh-CN-male', language: 'zh-CN', description: '浏览器中文男声优先匹配', enabled: true }
];

const DEFAULT_AZURE_VOICE_PACKAGES: VoicePackageInput[] = (
  [
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
    ['zh-TW', 'zh-TW-HsiaoYuNeural', '女', '台湾普通话女声']
  ] as [string, string, string, string, string?][]
).map(([language, voiceId, gender, description, style = '']) => ({
  name: `Azure ${description}`, provider: 'azure', voiceId, language, gender, style,
  rate: '0%', pitch: '0%', temperature: 0.85,
  sampleText: '你好，我正在为这局游戏进行语音试听。',
  description: `Azure Speech ${description}。部分 HD/预览音色可能受 Azure 区域限制。`,
  enabled: true
}));

export { DEFAULT_VOICE_PACKAGES, DEFAULT_AZURE_VOICE_PACKAGES };
export type { VoicePackageInput };
