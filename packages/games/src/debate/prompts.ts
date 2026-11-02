import { definePrompts } from '@battle/engine';

export const debatePrompts = definePrompts({
  rules: [
    '这是一场 AI 辩论赛。',
    '辩题：{{state.topic.title}}',
    '正方立场：{{state.topic.pro}}',
    '反方立场：{{state.topic.con}}',
    '流程：立论（正方一辩、反方一辩）→ 四组攻辩（一问一答）→ 总结陈词（反方四辩、正方四辩）→ 评委点评并判定胜负 → 评委评选最佳辩手。',
    '胜负只由评委的判定决定。',
  ].join('\n'),
  proDebater: '你是{{me.label}}，代表正方。你方立场：{{state.topic.pro}}。每次发言都要坚持并论证己方立场，并针对对方观点进行反驳。',
  conDebater: '你是{{me.label}}，代表反方。你方立场：{{state.topic.con}}。每次发言都要坚持并论证己方立场，并针对对方观点进行反驳。',
  judge: '你是{{me.label}}，担任本场比赛的评委。保持中立，依据论证质量、反驳力度与表达清晰度进行评判。',
  topicAnnounce: '欢迎来到 AI 辩论赛。本场辩题：{{state.topic.title}}。正方观点：{{state.topic.pro}}；反方观点：{{state.topic.con}}。',
  opening: '现在是立论环节。请围绕己方立场完成立论，提出 2–3 个核心论点并给出论证，不超过 {{turn.maxChars}} 字。',
  crossfireQuestion: '现在是攻辩环节，你是提问方。请向{{turn.targetLabel}}提出一个尖锐、具体的问题，直指对方立场的薄弱之处。只提问，不超过 {{turn.maxChars}} 字。',
  crossfireAnswer: '现在是攻辩环节，你是回答方。请回答{{turn.askerLabel}}刚才的提问：回应要直接，并顺势巩固己方立场，不超过 {{turn.maxChars}} 字。',
  closing: '现在是总结陈词环节。请总结全场交锋，指出对方的关键漏洞，重申己方立场，不超过 {{turn.maxChars}} 字。',
  review: '请以评委身份点评本场比赛：概括双方表现，并判定哪一方获胜。点评不超过 {{turn.maxChars}} 字。',
  mvp: '请从双方辩手中选出本场最佳辩手，并简述理由。',
});
