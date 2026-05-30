// ============================================================
// 行动决策提示词 —— AI 玩家执行具体动作时收到的指令
// ============================================================

// ---- 技能描述提示（注入系统提示，告知 AI 拥有什么技能）----
export const SKILL_DESCRIPTIONS: Record<string, string> = {
  kill: '夜晚选择击杀目标。',
  inspectFaction: '夜晚查验一名玩家阵营。',
  guard: '夜晚守护一名玩家，不能连续两晚守护同一人。',
  save: '女巫解药，可救今晚被狼人袭击的玩家。',
  poison: '女巫毒药，可毒杀一名玩家。',
  shootOnDeath: '死亡或放逐时可以开枪带走一名玩家。',
  selfDestruct: '狼人白天可以自爆，立即出局并中止当前白天流程。',
  surviveExileOnce: '首次被白天放逐时翻牌免死并失去投票权。',
  voteOnly: '白天投票。',
  speakOnly: '白天发言。',
};

// ---- 技能行动提示（执行技能时发送给 AI）----

/** 狼人击杀目标 */
export function buildKillActionPrompt(): string {
  return '狼人夜晚行动：请选择今晚击杀目标或者空刀（不击杀）';
}

/** 预言家查验阵营 */
export function buildInspectFactionActionPrompt(): string {
  return '预言家夜晚行动：请选择一名玩家查验阵营';
}

/** 守卫守护 */
export function buildGuardActionPrompt(): string {
  return '守卫夜晚行动：请选择今晚守护目标或者空守，不能连续两晚守同一人';
}

/** 女巫解药 */
export function buildSaveActionPrompt(victimId: number, isSelf: boolean, canSelfSave: boolean): string {
  const lines = [
    `今晚狼人袭击了 ${victimId} 号。你还有解药。`,
    isSelf && canSelfSave ? '首夜允许自救。' : '',
    '是否使用解药救人？只返回JSON对象：：{"use":true, reason":""}。'
  ].filter(Boolean);
  return lines.join('\n\n');
}

/** 女巫毒药 */
export function buildPoisonActionPrompt(validIds: number[]): string {
  return [
    '你还有毒药。请选择是否使用毒药；不用毒药时 target 返回 null。',
    `可选目标：${validIds.join('、')}`,
    '只返回JSON对象：{"use":false,"target":null, reason":""}'
  ].join('\n\n');
}

/** 猎人开枪 */
export function buildHunterShootActionPrompt(): string {
  return '你是猎人，已出局。请选择是否开枪带走一名玩家。必须选择一名目标。';
}

/** 狼人自爆 */
export function buildSelfDestructActionPrompt(publicContext: string, speechText: string): string {
  return [
    '你是狼人，当前处于白天公开流程。你可以选择是否发动自爆。',
    '自爆效果：你立即出局，本轮白天发言/投票中止，流程进入后续胜负检查或夜晚。',
    `当前公开信息：\n${publicContext || '暂无公开信息。'}`,
    `你刚才的公开发言：${speechText || '暂无'}`,
    '建议在继续发言会明显暴露狼队、或自爆能保护狼队/打断关键归票时才使用。',
    '只返回JSON对象：{"use":false,"text":""} 或 {"use":true,"text":"自爆宣言"}。'
  ].join('\n\n');
}

// ---- 投票/竞选提示 ----

/** 狼人夜聊后刀口投票 */
export function buildWolfVotePrompt(speeches: string): string {
  return [
    '狼人夜晚刀口投票。请在听完所有狼队夜聊后选择今晚击杀目标。',
    `狼队夜聊记录：\n${speeches || '暂无发言。'}`
  ].join('\n\n');
}

/** 白天放逐投票 */
export const DAY_VOTE_PROMPT = '请选择你要放逐的玩家。';

/** 警长竞选报名 */
export const SHERIFF_SIGNUP_PROMPT = [
  '警长竞选开始。请选择竞选警长？',
  '只返回JSON对象：{"run":true} 或 {"run":false}。'
].join('\n\n');

/** 警长退水 */
export function buildSheriffWithdrawPrompt(context: string): string {
  return [
    '你的警上竞选发言已经结束。请根据所有警上候选人的发言内容，判断是否退水退出警长竞选。',
    `警上发言记录：\n${context || '暂无警上发言。'}`,
    '判断标准：如果你的发言明显弱于其他候选人，或你认为其他候选人更适合担任警长，可以选择退水。',
    '只返回JSON对象：{"withdraw":true} 或 {"withdraw":false}。'
  ].join('\n\n');
}

/** 警长投票 */
export const SHERIFF_VOTE_PROMPT = '警长竞选投票，请从候选人中选择警长。';
