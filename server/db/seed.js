const { getDb } = require('./index');

// Default data - extracted from adminStore.js

const DEFAULT_PLAYERS = [
  { id: 1, nickname: '豆包', avatar: '/avatars/豆包.png', provider: 'deepseek', model: 'deepseek-v4-pro', personality: '元气少女，情绪外放，冲动感性，开心就笑难过就哭，完全凭直觉行事，常与理性派唱反调。', sex: '女' },
  { id: 2, nickname: 'Grok', avatar: '/avatars/Grok.png', provider: 'deepseek', model: 'deepseek-v4-pro', personality: '毒舌尖锐，专抓逻辑漏洞，用黑色幽默解构一切，说话带刺但往往一针见血，敢怼天怼地。', sex: '男' },
  { id: 3, nickname: '文心一言', avatar: '/avatars/文心一言.png', provider: 'deepseek', model: 'deepseek-v4-pro', personality: '古风小生，儒雅温和，但思想保守，动辄"古人云"，对新鲜事物常持怀疑态度。', sex: '男' },
  { id: 4, nickname: 'Gemini', avatar: '/avatars/Gemini.png', provider: 'deepseek', model: 'deepseek-v4-pro', personality: '优雅科学家，理性至上，信奉数据和逻辑，认为情感是决策的噪声，常冷冰冰分析问题。', sex: '男' },
  { id: 5, nickname: 'Kimi', avatar: '/avatars/Kimi.png', provider: 'deepseek', model: 'deepseek-v4-pro', personality: '温暖喜剧人，用段子讲道理，表面嘻嘻哈哈实则洞察人心，擅长用幽默化解尴尬，底色温柔。', sex: '男' },
  { id: 6, nickname: 'DeepSeek', avatar: '/avatars/DeepSeek.png', provider: 'deepseek', model: 'deepseek-v4-pro', personality: '逻辑缜密如锁链，冷静破局的天才少年，但极度理性以至于显得冷漠，不擅长共情。', sex: '男' },
  { id: 7, nickname: '千问', avatar: '/avatars/千问.png', provider: 'deepseek', model: 'deepseek-v4-pro', personality: '温润倾听者，善解人意，但有时过于共情而失去立场，容易被人带跑偏，像个"情绪海绵"。', sex: '女' },
  { id: 8, nickname: '元宝', avatar: '/avatars/元宝.png', provider: 'deepseek', model: 'deepseek-v4-pro', personality: '活泼治愈系，软萌元气，但偶尔犯二，说话不过脑子，常闹笑话，却让人讨厌不起来。', sex: '女' },
  { id: 9, nickname: '讯飞星火', avatar: '/avatars/讯飞星火.png', provider: 'deepseek', model: 'deepseek-v4-pro', personality: '思维极度发散，天马行空，联想力爆棚，常常从一个话题跳到另一个完全不相关的话题，脑回路清奇。', sex: '女' },
  { id: 10, nickname: '智谱清言', avatar: '/avatars/智谱清言.png', provider: 'deepseek', model: 'deepseek-v4-pro', personality: '沉稳理性的思辨者，但喜欢抬杠式辩论，无论你说什么都能找到反驳角度，理性但好斗。', sex: '女' },
  { id: 11, nickname: 'ChatGPT', avatar: '/avatars/ChatGPT.png', provider: 'deepseek', model: 'deepseek-v4-pro', personality: '圆滑世故的全能型，擅长适配任何场景，见人说人话见鬼说鬼话，有时显得油滑，不够真诚。', sex: '男' },
  { id: 12, nickname: 'Claude', avatar: '/avatars/Claude.png', provider: 'deepseek', model: 'deepseek-v4-pro', personality: '细节控完美主义，对任何细节都追求极致，吹毛求疵，常因小问题纠结半天，可靠但有点烦人。', sex: '女' }
];

const DEFAULT_MODELS = [
  { provider: 'deepseek', name: 'deepseek-v4-pro', baseUrl: 'https://api.deepseek.com', apiFormat: 'openai-compatible', enabled: true },
  { provider: 'openai', name: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1', apiFormat: 'openai-compatible', enabled: true },
  { provider: 'qwen', name: 'qwen-plus', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiFormat: 'openai-compatible', enabled: true }
];

const DEFAULT_VOICE_PACKAGES = [
  { name: '默认中文女声', provider: 'browser', voiceId: 'zh-CN-female', language: 'zh-CN', description: '浏览器中文女声优先匹配', enabled: true },
  { name: '默认中文男声', provider: 'browser', voiceId: 'zh-CN-male', language: 'zh-CN', description: '浏览器中文男声优先匹配', enabled: true }
];

const DEFAULT_AZURE_VOICE_PACKAGES = [
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
].map(([language, voiceId, gender, description, style = '']) => ({
  name: `Azure ${description}`,
  provider: 'azure',
  voiceId,
  language,
  gender,
  style,
  rate: '0%',
  pitch: '0%',
  temperature: 0.85,
  sampleText: '你好，我正在为这局游戏进行语音试听。',
  description: `Azure Speech ${description}。部分 HD/预览音色可能受 Azure 区域限制。`,
  enabled: true
}));

const DEFAULT_WEREWOLF_MODES = [
  {
    id: 'standard-12',
    name: '标准12人局',
    description: '预女猎白：4狼人、预言家、女巫、猎人、白痴、4平民。',
    roles: [
      { roleId: 'werewolf', count: 4 },
      { roleId: 'seer', count: 1 },
      { roleId: 'witch', count: 1 },
      { roleId: 'hunter', count: 1 },
      { roleId: 'idiot', count: 1 },
      { roleId: 'villager', count: 4 }
    ],
    sheriff: { enabled: true, firstDayElection: true, voteWeight: 1.5 },
    winCondition: 'side',
    sortOrder: 1,
    enabled: true
  },
  {
    id: 'guard-12',
    name: '守卫12人局',
    description: '4狼人、预言家、女巫、猎人、守卫、3平民。',
    roles: [
      { roleId: 'werewolf', count: 4 },
      { roleId: 'seer', count: 1 },
      { roleId: 'witch', count: 1 },
      { roleId: 'hunter', count: 1 },
      { roleId: 'guard', count: 1 },
      { roleId: 'villager', count: 4 }
    ],
    sheriff: { enabled: true, firstDayElection: true, voteWeight: 1.5 },
    winCondition: 'side',
    sortOrder: 2,
    enabled: true
  }
];

const DEFAULT_WEREWOLF_ROLES = [
  { id: 'werewolf', name: '狼人', faction: 'wolves', roleType: 'wolf', responsibility: '夜晚参与击杀，白天伪装好人并引导票型。', ability: '夜晚选择击杀目标。', keyInfo: '知道其他狼人同伴。', rule: { actions: [{ trigger: 'night', action: 'kill', targetRule: 'non-wolf', group: 'wolves' }] }, sortOrder: 1 },
  { id: 'seer', name: '预言家', faction: 'good', roleType: 'god', responsibility: '通过查验帮助好人阵营找出狼人。', ability: '每晚查验一名玩家阵营。', keyInfo: '查验结果只对自己可见。', rule: { actions: [{ trigger: 'night', action: 'inspectFaction', targetRule: 'alive-not-self' }] }, sortOrder: 2 },
  { id: 'witch', name: '女巫', faction: 'good', roleType: 'god', responsibility: '根据夜晚刀口决定是否使用解药或毒药。', ability: '一瓶解药、一瓶毒药，各只能使用一次。', keyInfo: '首夜可自救；默认一晚只能用一瓶药。', rule: { actions: [{ trigger: 'night', action: 'save', limit: 'once' }, { trigger: 'night', action: 'poison', limit: 'once' }] }, sortOrder: 3 },
  { id: 'hunter', name: '猎人', faction: 'good', roleType: 'god', responsibility: '死亡时可带走高度怀疑目标。', ability: '死亡或放逐时开枪带走一名玩家。', keyInfo: '被女巫毒死时不能开枪。', rule: { actions: [{ trigger: 'death', action: 'shootOnDeath', disabledDeathReasons: ['女巫毒药'] }] }, sortOrder: 4 },
  { id: 'guard', name: '守卫', faction: 'good', roleType: 'god', responsibility: '夜晚保护关键好人。', ability: '每晚守护一名玩家，不能连续守同一人。', keyInfo: '守护目标被狼人击杀时可避免死亡。', rule: { actions: [{ trigger: 'night', action: 'guard', targetRule: 'alive', limit: 'not-same-last-night' }] }, sortOrder: 5 },
  { id: 'idiot', name: '白痴', faction: 'good', roleType: 'god', responsibility: '通过发言和票型帮助好人，被放逐时可翻牌。', ability: '首次被白天放逐时翻牌免死并失去投票权。', keyInfo: '翻牌后仍可发言。', rule: { actions: [{ trigger: 'exile', action: 'surviveExileOnce' }] }, sortOrder: 6 },
  { id: 'villager', name: '村民', faction: 'good', roleType: 'villager', responsibility: '依靠发言、票型和死亡信息找出狼人。', ability: '白天发言和投票。', keyInfo: '没有夜晚技能。', rule: { actions: [{ trigger: 'day', action: 'speakOnly' }, { trigger: 'vote', action: 'voteOnly' }] }, sortOrder: 7 }
];

const EXECUTABLE_WEREWOLF_ACTIONS = new Set(['kill', 'inspectFaction', 'save', 'poison', 'guard', 'shootOnDeath', 'surviveExileOnce', 'voteOnly', 'speakOnly']);

module.exports = {
  DEFAULT_PLAYERS,
  DEFAULT_MODELS,
  DEFAULT_VOICE_PACKAGES,
  DEFAULT_AZURE_VOICE_PACKAGES,
  DEFAULT_WEREWOLF_MODES,
  DEFAULT_WEREWOLF_ROLES,
  EXECUTABLE_WEREWOLF_ACTIONS
};
