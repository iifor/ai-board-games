export const AZURE_STYLE_LABELS: Readonly<Record<string, string>> = {
  adventurous: '冒险', agent: '特工', anxious: '焦虑', assassin: '刺客', audiobook: '有声书',
  captain: '船长', caringempathy: '关怀共情', cavalier: '骑士', conversation: '交谈',
  'customer-service': '客服', customer_call_center: '呼叫中心', cute: '可爱',
  disappointed: '失望', educational: '教学', friendlycheerful: '友好欢快', funny: '幽默',
  geomancer: '风水师', narrator: '旁白', nervous: '紧张', nostalgic: '怀旧',
  poet: '诗人', prince: '王子', reflective: '沉思', saddisappointed: '悲伤失望',
  sentimental: '感伤', story: '故事叙述', 'story-telling': '讲故事',
  affectionate: '亲切', angry: '愤怒', assistant: '语音助手', calm: '平静', chat: '聊天',
  'chat-casual': '随意聊天', cheerful: '欢快', complaining: '抱怨', comforting: '安慰',
  confused: '困惑', curious: '好奇', customerservice: '客服', debating: '辩论',
  depressed: '低落', determined: '坚定', disgruntled: '不满', disgusted: '厌恶',
  embarrassed: '尴尬', empathetic: '共情', encouraging: '鼓励', envious: '羡慕',
  excited: '兴奋', ecstatic: '欣喜若狂', fearful: '害怕', friendly: '友好', gentle: '温柔',
  guilty: '内疚', happy: '开心', hopeful: '充满希望', jealous: '嫉妒', joyful: '喜悦',
  lonely: '孤独', lyrical: '抒情', news: '新闻播报', newscast: '新闻播报',
  'newscast-casual': '轻松播报', 'newscast-formal': '正式播报',
  'narration-professional': '专业叙述', 'narration-relaxed': '轻松叙述',
  'documentary-narration': '纪录片旁白', 'poetry-reading': '诗歌朗诵',
  'advertisement-upbeat': '活力广告', 'game-narrator': '游戏解说',
  livecommercial: '直播带货', 'live-commercial': '直播带货',
  'sports-commentary': '体育解说', 'sports-commentary-excited': '激情体育解说',
  regretful: '懊悔', relieved: '释然', sad: '悲伤', serious: '严肃', shouting: '喊叫',
  shy: '害羞', softvoice: '轻声', sorry: '歉意', strict: '严厉', surprised: '惊讶',
  terrified: '惊恐', tired: '疲惫', unfriendly: '冷淡', 'voice-assistant': '语音助手',
  whispering: '耳语',
};

export function voiceStyleLabel(style: string): string {
  if (!style) return '自然（默认）';
  const label = AZURE_STYLE_LABELS[style];
  return label ? `${label}（${style}）` : style;
}

export function azureStyleTag(style: string): string | undefined {
  return Object.hasOwn(AZURE_STYLE_LABELS, style) ? AZURE_STYLE_LABELS[style] : undefined;
}

/** Azure 存在同中文含义的不同风格标识，按音色实际支持项选择。 */
export function azureStyleCandidates(style: string): string[] {
  if (style === 'happy') return ['happy', 'cheerful'];
  if (style === 'cheerful') return ['cheerful', 'happy'];
  const label = azureStyleTag(style);
  if (!label) return [style];
  return Object.keys(AZURE_STYLE_LABELS).filter(key => AZURE_STYLE_LABELS[key] === label);
}
