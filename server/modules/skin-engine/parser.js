const { SKIN_PACK_PATH, BUILTIN_TEMPLATE } = require('./constants');
const { extractBetween, slugify } = require('./utils');

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

module.exports = { parseSkinMarkdown, parseSkinSection };
