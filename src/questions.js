const QUESTIONS = [
  { a: '效率优先', b: '公平优先' },
  { a: '探索未知', b: '守护安稳' },
  { a: '理性决策', b: '直觉决策' },
  { a: '遵循规则', b: '灵活变通' },
  { a: '个人权利', b: '集体利益' },
  { a: '透明公开', b: '隐私保护' },
  { a: '长期收益', b: '短期止损' },
  { a: '严格惩罚', b: '给人机会' },
  { a: '统一标准', b: '因人而异' },
  { a: '冒险突破', b: '稳健积累' },
  { a: '专家判断', b: '群体投票' },
  { a: '资源集中', b: '平均分配' },
  { a: '快速行动', b: '充分讨论' },
  { a: '信任默认', b: '审查默认' },
  { a: '结果导向', b: '过程正义' }
];

function formatQuestion(question) {
  return `A：${question.a} / B：${question.b}`;
}

function drawQuestions(count, rng = Math.random) {
  const pool = [...QUESTIONS];
  const picked = [];

  while (picked.length < count && pool.length > 0) {
    const index = Math.floor(rng() * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }

  return picked;
}

module.exports = {
  QUESTIONS,
  drawQuestions,
  formatQuestion
};
