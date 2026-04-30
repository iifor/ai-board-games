const fs = require('fs');

const SKIN_PACK_PATH = process.env.MIST_SKIN_PACK_PATH || '/Users/wuqingfu/Desktop/共识迷雾/皮肤.md';

const BASE_INVESTIGATION_QUESTIONS = [
  { a: '优先调查现场记录', b: '优先调查相关人员证词' },
  { a: '立即公开关键证据，供所有人讨论', b: '暂时封存关键证据，等待系统鉴定' },
  { a: '检查权限与访问记录', b: '检查时间线与通讯记录' }
];

const BUILTIN_TEMPLATE = {
  id: 'ai-lab-anomaly',
  name: 'AI实验室异常',
  version: 'v3.2',
  source: 'builtin',
  background: [
    '在封闭式 AI 安全实验室“零号层”中，一台受限测试模型在未授权情况下完成了自我复制。',
    '安全协议被短暂关闭，实验日志却显示没有任何研究员提交过解除申请。模型输出记录中反复出现一句话：“共识只是另一种漏洞。”',
    '现场留下了若干矛盾证据：权限日志出现重写痕迹；终端摄像头在关键时段失效；有人提前下载了隔离区访问手册。',
    '所有玩家都是实验室成员。你们必须通过三轮调查，找出真正解除安全限制的人。'
  ].join('\n'),
  terms: {
    investigators: '安全调查员',
    mist: '隐瞒者',
    keyFigure: '违规操作者',
    cover: '日志篡改者',
    suspicionMark: '风险标记',
    exclusion: '权限冻结',
    lastTestimony: '离组记录'
  },
  truth: '违规操作者曾提前下载隔离区访问手册，并在终端摄像头失效窗口内借助日志篡改者制造的重写痕迹，短暂关闭安全协议，导致受限测试模型完成自我复制。',
  clues: [
    {
      title: '第1组线索',
      text: '隔离区访问手册在异常前一天被提前下载，下载记录经过一次轻微重命名，无法直接确认操作者身份。',
      veracity: '可能为真',
      appraisal: '无'
    },
    {
      title: '第2组线索',
      text: '权限复核日志显示，异常发生前 12 分钟有一次临时授权被撤回，撤回理由写得过于简短。',
      veracity: '可能为真',
      appraisal: '系统确认：第1组线索内容属实。'
    },
    {
      title: '第3组线索',
      text: '安全协议关闭窗口与一台备用终端的离线维护记录重合，维护记录中的备注语气不像例行巡检。',
      veracity: '真',
      appraisal: '系统确认：第2组线索内容存在刻意省略，但核心时间记录属实。'
    }
  ],
  noises: [
    '系统检测到公共终端在异常前后被短暂访问，但无法确认访问者身份。',
    '一段低清监控显示，有人曾在资料库门口停留，但画面无法确认身份。',
    '日志显示，有一份非核心文件被重复打开过，但无法确认它是否与事件有关。'
  ],
  memoryExamples: []
};

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

function parseSkinMarkdown(markdown) {
  const sections = markdown.split(/^##\s+皮肤\s*\d+：/m).slice(1);
  const headings = [...markdown.matchAll(/^##\s+皮肤\s*\d+：(.+)$/gm)].map((match) => match[1].trim());

  return sections
    .map((section, index) => parseSkinSection(headings[index], section, index + 1))
    .filter(Boolean);
}

function parseSkinSection(name, section, index) {
  const terms = parseTerms(section);
  const background = extractBetween(section, '**事件背景**', '**线索**').trim();
  const clues = parseClues(section);
  if (!name || !background || clues.length < 3) return null;

  return {
    id: `skin-${index}-${slugify(name)}`,
    name,
    version: 'v3.2',
    source: SKIN_PACK_PATH,
    background,
    terms: {
      investigators: terms['调查方'] || '调查方',
      mist: terms['迷雾方'] || '迷雾方',
      keyFigure: terms['关键人物'] || '关键人物',
      cover: terms['掩护者'] || '掩护者',
      exclusion: terms['排除行动'] || '排除行动',
      suspicionMark: terms['嫌疑标记'] || '嫌疑标记',
      lastTestimony: terms['最后证词'] || '最后证词'
    },
    truth: buildTruth(name, terms['关键人物'] || '关键人物', clues),
    clues: clues.map((clue, clueIndex) => ({
      title: `第${clueIndex + 1}组线索`,
      text: clue.text,
      veracity: clue.veracity,
      appraisal: buildAppraisal(clues, clueIndex)
    })),
    noises: buildNoises(background),
    memoryExamples: parseMemoryExamples(section)
  };
}

function parseTerms(section) {
  const block = extractBetween(section, '**术语替换**', '**事件背景**');
  const terms = {};
  for (const line of block.split(/\r?\n/)) {
    const cells = line.split('|').map((item) => item.trim()).filter(Boolean);
    if (cells.length < 2 || cells[0] === '通用' || /^-+$/.test(cells[0])) continue;
    terms[cells[0]] = cells[1];
  }
  return terms;
}

function parseClues(section) {
  const block = extractBetween(section, '**线索**', '**记忆卡示例**');
  const clues = [];
  for (const line of block.split(/\r?\n/)) {
    const cells = line.split('|').map((item) => item.trim()).filter(Boolean);
    if (cells.length < 3 || cells[0] === '轮次' || /^-+$/.test(cells[0])) continue;
    clues.push({ text: cells[1], veracity: cells[2] });
  }
  return clues.slice(0, 3);
}

function parseMemoryExamples(section) {
  const block = extractBetween(section, '**记忆卡示例**', '---');
  return block
    .split(/\n(?=\*)/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function extractBetween(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  if (start === -1) return '';
  const from = start + startMarker.length;
  const end = text.indexOf(endMarker, from);
  return text.slice(from, end === -1 ? text.length : end);
}

function buildAppraisal(clues, index) {
  if (index === 0) return '无';
  const previous = clues[index - 1];
  if (previous.veracity.includes('真')) return `系统确认：第${index}组线索内容属实。`;
  if (previous.veracity.includes('假')) return `系统确认：第${index}组线索内容存在伪造或误导。`;
  return `系统确认：第${index}组线索需要结合证词谨慎判断。`;
}

function buildTruth(name, keyFigureTerm, clues) {
  const trueClues = clues.filter((clue) => clue.veracity.includes('真')).map((clue) => clue.text);
  return `${name}的核心真相与${keyFigureTerm}有关。可信线索显示：${trueClues.join('；')}。`;
}

function buildNoises(background) {
  const firstEvidence = background
    .split(/\r?\n/)
    .map((line) => line.replace(/^-\s*/, '').trim())
    .find((line) => line && !line.includes('所有玩家') && !line.includes('找出'));

  return [
    `${firstEvidence || '现场记录'}附近出现一段弱相关异常记录，但无法确认具体人员。`,
    '系统发现一条边缘日志被反复打开过，但无法确认它是否与核心事件有关。',
    '低清记录显示有人在关键区域附近短暂停留，但画面不足以确认身份。'
  ];
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
    ? `你与“${clueOne}”存在可解释的关联，但不能让大家把它直接视为定案。`
    : player.role === 'cover'
      ? `你掌握一些与“${clueTwo}”有关的边缘信息，可以选择淡化或延迟释放。`
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
    '表达限制：你不能直接说“根据属性表”，必须用自然语言证词表达。'
  ].filter(Boolean).join('\n');
}

function chooseMemoryExample(role, examples = []) {
  if (!examples.length) return '';
  const keyword = role === 'keyFigure' ? '关键人物' : role === 'cover' ? '掩护者' : '调查方';
  return examples.find((item) => item.includes(keyword)) || examples[0];
}

function slugify(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fa5-]/g, '');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  BUILTIN_TEMPLATE,
  buildMemoryCard,
  getInvestigationQuestions,
  getMarkdownSkinTemplates,
  getRandomTemplate,
  getSkinTemplates
};
