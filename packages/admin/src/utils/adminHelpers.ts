import type { RefObject } from 'react';
import type { SelectOption } from '../types/api';
import type { VoicePackage } from '../types/entities';
import type { LlmCall } from '../types/trace';
import { GAME_LABELS, DEBATE_ROLE_LABELS, emptySkin } from '../constants/adminConstants';

type FieldAccessor<T> = keyof T | ((item: T) => string | undefined);

export function normalizePath(pathname: string): string {
  return pathname === '/' ? '/dashboard' : pathname;
}

export function getGameTitle(game: { topic?: string | { title?: string }; event?: { name?: string }; skinName?: string }): string {
  const topic = game?.topic;
  if (typeof topic === 'string') return topic;
  return (topic as { title?: string })?.title || game?.event?.name || game?.skinName || '-';
}

export function modelName(player: { modelId?: number | null; model?: string }, models: Array<{ id: number; provider: string; name: string }>): string {
  const linked = models.find((model) => model.id === player.modelId);
  if (linked) return `${linked.provider}/${linked.name}`;
  return player.model || '-';
}

export function filterByQuery<T>(items: T[], query: string | undefined, fields: FieldAccessor<T>[]): T[] {
  const needle = normalizeSearchText(query);
  if (!needle) return items;
  return items.filter((item) => fields.some((field) => {
    const value = typeof field === 'function' ? field(item) : (item as Record<string, unknown>)?.[field as string];
    return normalizeSearchText(String(value ?? '')).includes(needle);
  }));
}

export function uniqueOptions(values: Array<string | number | undefined | null>, formatter: (value: string | number | null) => string | undefined = (value) => String(value)): SelectOption[] {
  const seen = new Set<string>();
  return values
    .filter((value): value is string | number => value !== undefined && value !== null && value !== '')
    .filter((value) => {
      const key = String(value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((value) => ({ value, label: formatter(value) || String(value) }));
}

export function booleanOptions(): SelectOption[] {
  return [
    { value: true, label: '启用' },
    { value: false, label: '停用' }
  ];
}

export function summarizeWerewolfRoles(items: Array<{ roleId: string; count: number }> = [], roles: Array<{ id: string; name: string }> = []): string {
  const roleMap = new Map(roles.map((role) => [role.id, role]));
  const text = items.map((item) => `${item.count} ${roleMap.get(item.roleId)?.name || item.roleId}`).join('、');
  return text || '-';
}

export function normalizeSearchText(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

export function parseJsonField<T>(value: string | T | undefined, fallback: T): T {
  if (!value) return fallback;
  if (typeof value !== 'string') return value;
  return JSON.parse(value) as T;
}

export function normalizeSkinFormValues(values: Record<string, unknown> | undefined): Record<string, unknown> {
  const safeValues = values ?? {};
  return {
    ...emptySkin,
    ...safeValues,
    terms: JSON.stringify(safeValues.terms ?? {}, null, 2),
    clues: JSON.stringify(safeValues.clues ?? [], null, 2),
    noises: JSON.stringify(safeValues.noises ?? [], null, 2),
    memoryExamples: JSON.stringify(safeValues.memoryExamples ?? [], null, 2)
  };
}

export function formatTime(value: string | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

export function formatApiFormat(value: string | undefined): string {
  if (value === 'anthropic-compatible') return 'Anthropic 兼容';
  if (value === 'custom') return '旧版自定义';
  return 'OpenAI 兼容';
}

export function formatVoiceProvider(value: string | number | null | undefined): string {
  if (value === 'azure') return 'Azure Speech';
  if (value === 'mimo') return 'Mimo TTS';
  if (value === 'browser') return '浏览器本地语音';
  return String(value || '-');
}

export function formatGameMode(value: string | undefined, game: { werewolfMode?: { id?: string }; event?: { mode?: string; modeId?: string }; gameType?: string }, modes: Array<{ id: string; name: string }> = []): string {
  const text = String(value || '').trim();
  const modeId = game?.werewolfMode?.id || game?.event?.mode || game?.event?.modeId || text;
  const configuredMode = modes.find((mode) => mode.id === modeId || mode.name === modeId);
  if (configuredMode) return configuredMode.name;
  const map: Record<string, string> = {
    real: '真实对局',
    imported: '导入对局',
    standard: '标准局',
    'standard-12': '标准局',
    'gargoyle-undertaker': '石像鬼守墓人',
    'thief-cupid': '盗贼丘比特'
  };
  return map[text] || map[modeId] || text || '-';
}

export function formatWinner(value: string | number | null | undefined): string {
  const map: Record<string, string> = {
    pro: '正方', con: '反方',
    good: '好人阵营', villager: '好人阵营', villagers: '好人阵营',
    werewolf: '狼人阵营', wolves: '狼人阵营',
  };
  return map[String(value || '').toLowerCase()] || String(value || '-');
}

export function formatSideOrCamp(record: { sideLabel?: string; side?: string; camp?: string; faction?: string; team?: string; sideIndex?: number }, gameType?: string): string {
  if (record.sideLabel) return record.sideLabel;
  const raw = record.side || record.camp || record.faction || record.team || '';
  const map: Record<string, string> = {
    pro: '正方', affirmative: '正方', con: '反方', negative: '反方',
    judge: '评委', host: '主持人',
    werewolf: '狼人阵营', wolves: '狼人阵营', wolf: '狼人阵营',
    good: '好人阵营', villager: '好人阵营', villagers: '好人阵营',
    god: '神职阵营', neutral: '中立阵营',
    investigator: '调查员', citizen: '市民', mist: '迷雾阵营'
  };
  const formatted = map[String(raw).toLowerCase()];
  if (formatted) return formatted;
  if (gameType === 'debate' && Number.isInteger(record.sideIndex)) return record.side === 'con' ? '反方' : '正方';
  return raw || '-';
}

export function formatRole(record: { side?: string; sideIndex?: number; roleLabel?: string; role?: string; identity?: string }, gameType?: string): string {
  if (gameType === 'debate' && record.side !== 'judge' && Number.isInteger(record.sideIndex)) return DEBATE_ROLE_LABELS[record.sideIndex!] || '-';
  if (record.roleLabel) return record.roleLabel;
  const raw = record.role || record.identity || '';
  const map: Record<string, string> = {
    werewolf: '狼人', villager: '村民', seer: '预言家', witch: '女巫',
    hunter: '猎人', guard: '守卫', sheriff: '警长', judge: '评委',
    investigator: '调查员', host: '主持人'
  };
  return map[String(raw).toLowerCase()] || raw || '-';
}

export function getImportPromptRule(gameType: string): string | undefined {
  if (gameType === 'debate') {
    return [
      '- type 固定为 "debate" 或 "ai_debate_match"。',
      '- 必须包含 topic.title、topic.proPosition、topic.conPosition。',
      '- players 至少包含正方 4 人、反方 4 人，可包含评委；每人包含 id、nickname、side(pro/con/judge)、sideIndex。',
      '- phases 或 rounds 要覆盖开场/立论/攻辩/自由辩/总结/评委点评/结果等流程。',
      '- speeches 中 playerId 必须对应 players 中的人，text 要有明确论点和反驳。',
      '- result/winner/mvp/winReason 要和发言表现一致。'
    ].join('\n');
  }
  if (gameType === 'werewolf') {
    return [
      '- type 固定为 "werewolf"。',
      '- 必须包含 gameId 或 id、mode、players、rounds。',
      '- players 需要包含 id、nickname、role、camp/alignment，角色和阵营要自洽。',
      '- rounds 要覆盖夜晚行动、白天发言、投票、遗言、胜负结算。',
      '- 发言、投票和死亡结果要能解释最终 winner。'
    ].join('\n');
  }
  return undefined;
}

export function getImportPromptFlowRequirements(gameType: string): string {
  const common = [
    '- 所有玩家发言 text 不超过 80-180 个中文字符，关键总结/评委点评/遗言/结算说明不超过 120-240 个中文字符。',
    '- thinking 如提供，控制在 30-80 个中文字符，只写该角色当下判断，不泄露非本角色应知道的信息。',
    '- 流程必须按真实游戏顺序推进，事件数量要足够支撑胜负、MVP、阵营立场或最终结论。'
  ];
  if (gameType === 'debate') {
    return [
      ...common,
      '- 辩论赛至少包含开场、立论、攻辩/质询、自由辩、总结陈词、评委点评、最终结果。',
      '- 正反方 1-4 辩每人至少 1 次有效发言，评委点评要引用具体表现。'
    ].join('\n');
  }
  if (gameType === 'werewolf') {
    return [
      ...common,
      '- 狼人杀至少包含夜晚行动、白天发言、投票、遗言、胜负结算，建议不少于 2 个昼夜轮次。',
      '- 每轮发言、投票理由和死亡结果要能解释最终阵营胜负。'
    ].join('\n');
  }
  return [
    ...common,
    '- 共识迷雾至少包含 3 轮调查：每轮问题、匿名投票、线索/噪音揭示、玩家讨论、阶段判断。',
    '- 玩家发言要围绕皮肤真相、线索、噪音和个人记忆推进，不要只给结论。'
  ].join('\n');
}

export function buildImportGenerationPrompt(gameType: string, players: Array<{ id: number; nickname?: string; name?: string; sex?: string; personality?: string; model?: string; modelName?: string; modelId?: number | null; voicePackageId?: number | null }> = []): string {
  const playerLines = players.map((player) => [
    `id=${player.id}`,
    `昵称=${player.nickname || player.name || ''}`,
    `性别=${player.sex || '未知'}`,
    `人格=${player.personality || '未配置'}`,
    `模型=${player.model || player.modelName || player.modelId || '未绑定'}`,
    `语音包=${player.voicePackageId || '未绑定'}`
  ].join('；')).join('\n');
  const rule = getImportPromptRule(gameType);
  const flowPrompt = getImportPromptFlowRequirements(gameType);
  return [
    `你是一个严谨的 AI 对局 JSON 生成器。请生成一份可直接导入后台的 ${GAME_LABELS[gameType] || gameType} 对局 JSON。`,
    '',
    '硬性要求：',
    '1. 只输出 JSON，不要输出 Markdown、解释或代码块。',
    '2. 必须使用下面玩家池中的真实 id 和昵称，不要虚构玩家。',
    '3. 每位玩家的发言要符合其人格，流程要完整，结果要自洽。',
    '4. 每条发言包含 playerId、text；如果有思考过程，可额外提供 thinking 字段。',
    '5. 时间、胜负、MVP/关键角色等结果必须能从流程中看出原因。',
    '',
    '游戏规则与目标结构：',
    rule,
    '',
    '流程与字数要求：',
    flowPrompt,
    '',
    '可用玩家池：',
    playerLines || '暂无玩家，请先在玩家管理中配置玩家。',
    '',
    '现在请生成完整 JSON。'
  ].join('\n');
}

export async function copyText(text: string, messageApi: { success: (msg: string) => void; error: (msg: string) => void }): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    messageApi.success('提示词已复制');
  } catch {
    messageApi.error('复制失败，请手动选择文本复制');
  }
}

export async function playVoicePackage(voice: VoicePackage, text: string | undefined, audioRef: RefObject<HTMLAudioElement | null>): Promise<void> {
  const provider = String(voice.provider || 'browser').trim().toLowerCase();
  const content = String(text || voice.sampleText || '你好，我是本局玩家的试听声音。').trim();
  if (provider === 'browser') {
    playBrowserSpeech(voice, content);
    return;
  }
  const response = await fetch(`/api/admin/voice-packages/${voice.id}/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: content })
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(payload?.message || '语音试听失败');
  }
  const blob = await response.blob();
  const audio = audioRef.current || new Audio();
  audio.src = URL.createObjectURL(blob);
  await audio.play();
}

function playBrowserSpeech(voice: VoicePackage, text: string): void {
  if (!window.speechSynthesis) throw new Error('当前浏览器不支持本地语音试听。');
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = voice.language || 'zh-CN';
  const voices = window.speechSynthesis.getVoices?.() || [];
  const matched = voices.find((item) => item.voiceURI === voice.voiceId || item.name === voice.voiceId)
    || voices.find((item) => item.lang === voice.language)
    || voices.find((item) => /^zh/i.test(item.lang));
  if (matched) utterance.voice = matched;
  window.speechSynthesis.speak(utterance);
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

export function getTraceTokenSummary(llmCalls: LlmCall[] = []): { promptTokens: number; completionTokens: number; totalTokens: number } {
  return llmCalls.reduce(
    (summary, call) => {
      const promptTokens = Number(call?.prompt_tokens) || 0;
      const completionTokens = Number(call?.completion_tokens) || 0;
      return {
        promptTokens: summary.promptTokens + promptTokens,
        completionTokens: summary.completionTokens + completionTokens,
        totalTokens: summary.totalTokens + promptTokens + completionTokens
      };
    },
    { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  );
}

export function formatTokenCount(value: number | undefined): string {
  return Number(value || 0).toLocaleString();
}
