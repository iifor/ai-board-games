const fs = require('fs');
const { SKIN_PACK_PATH, BUILTIN_TEMPLATE, BASE_INVESTIGATION_QUESTIONS } = require('./constants');
const { parseSkinMarkdown } = require('./parser');
const { clone, chooseMemoryExample } = require('./utils');

let skinCache = {
  mtimeMs: null,
  templates: [BUILTIN_TEMPLATE],
  loadedAt: 0
};

function getRandomTemplate(rng = Math.random) {
  const templates = getSkinTemplates();
  return clone(templates[Math.floor(rng() * templates.length)] || BUILTIN_TEMPLATE);
}

function getInvestigationQuestions(template = BUILTIN_TEMPLATE) {
  const eventName = template.name || '本次事件';
  const terms = template.terms || BUILTIN_TEMPLATE.terms;
  const clues = template.clues || BUILTIN_TEMPLATE.clues;

  return [
    {
      ...BASE_INVESTIGATION_QUESTIONS[0],
      premise: `${eventName}刚刚进入初查阶段，公开证据彼此矛盾。主持人只能先打开一个调查入口：是先看客观记录，还是先听相关人员怎么解释？`
    },
    {
      ...BASE_INVESTIGATION_QUESTIONS[1],
      premise: `第一轮讨论后，大家已经形成若干怀疑对象。眼下有一份可能影响${terms.suspicionMark || '嫌疑标记'}的关键材料：立刻公开会加速判断，封存鉴定则更稳但会拖慢节奏。`
    },
    {
      ...BASE_INVESTIGATION_QUESTIONS[2],
      premise: `最终指认前，只剩一次调查窗口。要锁定${terms.keyFigure || '关键人物'}，可以追权限和访问痕迹，也可以核对时间线与通讯记录，两条路只能优先推进一条。`
    }
  ];
}

function getSkinTemplates() {
  refreshSkinCache();
  return skinCache.templates;
}

function getMarkdownSkinTemplates() {
  refreshSkinCache();
  return skinCache.templates.filter((template) => template.source !== 'builtin');
}

function refreshSkinCache() {
  try {
    if (!fs.existsSync(SKIN_PACK_PATH)) {
      skinCache = { ...skinCache, templates: [BUILTIN_TEMPLATE] };
      return;
    }

    const stat = fs.statSync(SKIN_PACK_PATH);
    if (skinCache.mtimeMs === stat.mtimeMs && skinCache.templates.length) return;

    const markdown = fs.readFileSync(SKIN_PACK_PATH, 'utf8');
    const parsed = parseSkinMarkdown(markdown);
    skinCache = {
      mtimeMs: stat.mtimeMs,
      templates: parsed.length ? parsed : [BUILTIN_TEMPLATE],
      loadedAt: Date.now()
    };
  } catch (error) {
    console.error(`皮肤包缓存加载失败，使用内置皮肤：${error.message}`);
    skinCache = { ...skinCache, templates: [BUILTIN_TEMPLATE] };
  }
}

function buildMemoryCard(player, allPlayers, keyFigureId, coverId, template = BUILTIN_TEMPLATE) {
  const terms = template.terms || BUILTIN_TEMPLATE.terms;
  const others = allPlayers.filter((item) => item.id !== player.id);
  const next = others[(player.id + 1) % others.length];
  const nearKey = allPlayers.find((item) => item.id === keyFigureId);
  const nearCover = allPlayers.find((item) => item.id === coverId);
  const clueOne = template.clues?.[0]?.text || '第一组线索';
  const clueTwo = template.clues?.[1]?.text || '第二组线索';

  const roleView = player.role === 'keyFigure'
    ? `你是${terms.mist}中的${terms.keyFigure}，需要避免被${terms.exclusion}或最终指认。`
    : player.role === 'cover'
      ? `你是${terms.mist}中的${terms.cover}，你知道 ${keyFigureId} 号是${terms.keyFigure}。`
      : `你是${terms.investigators}，需要通过线索和证词找出${terms.keyFigure}。`;

  const selfInfo = player.role === 'keyFigure'
    ? `你与"${clueOne}"存在可解释的关联，但不能让大家把它直接视为定案。`
    : player.role === 'cover'
      ? `你掌握一些与"${clueTwo}"有关的边缘信息，可以选择淡化或延迟释放。`
      : '你参与了事件后的复核，但只掌握局部流程信息。';

  const observation = player.role === 'keyFigure'
    ? `你记得 ${coverId} 号能帮你把讨论引向其他噪音。`
    : player.role === 'cover'
      ? `你知道 ${keyFigureId} 号与第一组线索有弱关联，但这条信息可以被解释成正常行为。`
      : `你印象中 ${nearKey?.id || next.id} 号与第一组线索有些关联，${nearCover?.id || next.id} 号对记录流程讲得很细。`;

  const example = chooseMemoryExample(player.role, template.memoryExamples);

  return [
    `【玩家${player.id}个人记忆卡】`,
    `身份视角：${roleView}`,
    `自我信息：${selfInfo}`,
    `他人观察：${observation}`,
    `模糊记忆：你似乎在事件前后听到 ${next.id} 号提过关键区域或关键记录，但当时信息很乱，不能确定。`,
    '可选择性表达信息：你知道一条边缘记录可能影响判断，但它未必指向真正的关键人物。',
    example ? `参考口吻：${example.replace(/\s+/g, ' ').slice(0, 160)}` : '',
    '表达限制：你不能直接说"根据属性表"，必须用自然语言证词表达。'
  ].filter(Boolean).join('\n');
}

module.exports = {
  getRandomTemplate,
  getInvestigationQuestions,
  getSkinTemplates,
  getMarkdownSkinTemplates,
  buildMemoryCard
};
