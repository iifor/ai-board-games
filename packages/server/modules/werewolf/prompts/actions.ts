// ============================================================
// 行动决策提示词 —— AI 玩家执行具体动作时收到的指令
// ============================================================

// ---- 技能描述提示（注入系统提示，告知 AI 拥有什么技能）----
export const SKILL_DESCRIPTIONS: Record<string, string> = {
  kill: '夜晚击杀一名存活玩家。',
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
export function buildTargetJsonContract(validIds: number[], options: { reason?: 'required' | 'optional' | 'none'; nullable?: boolean } = {}): string {
  const reason = options.reason || 'none';
  const reasonText = reason === 'required'
    ? 'reason 必须填写简短原因。'
    : reason === 'optional'
      ? 'reason 可以填写简短原因；不行动时可为 null。'
      : '不需要 reason。';
  const actionExample = `JSON 示例：{"targetSeat":2${reason === 'none' ? '' : ',"reason":"简短原因"'}}。`;
  const skipExample = options.nullable ? `不行动示例：{"targetSeat":null${reason === 'none' ? '' : ',"reason":"简短原因"'}}。` : '';
  return [
    '只返回标准 JSON 对象，不要输出 Markdown、解释或多余文本。',
    `可选目标座位号：${validIds.join('、') || '无'}。`,
    actionExample,
    skipExample,
    reasonText,
  ].filter(Boolean).join('\n');
}

/** 狼人击杀目标 */
export function buildKillActionPrompt(validIds: number[] = []): string {
  return [
    '狼人夜晚行动：请选择今晚击杀目标或者空刀（不击杀）。',
    validIds.length ? `可选目标座位号：${validIds.join('、')}。` : '',
  ].filter(Boolean).join('\n');
}

/** 预言家查验阵营 */
export function buildInspectFactionActionPrompt(validIds: number[] = []): string {
  return [
    '预言家夜晚行动：请选择一名玩家查验阵营，可以简要说明查验原因。',
    validIds.length ? `可选目标座位号：${validIds.join('、')}。` : '',
    '只返回标准 JSON 对象，例如 {"targetSeat":2,"reason":"我今晚查x号，原因是..."}；reason 可为 null。',
  ].filter(Boolean).join('\n');
}

/** 守卫守护 */
export function buildGuardActionPrompt(validIds: number[] = []): string {
  return [
    '守卫夜晚行动：请选择今晚守护目标或者空守，不能连续两晚守同一人。',
    validIds.length ? `可选目标座位号：${validIds.join('、')}。` : '',
    '只返回标准 JSON 对象：守护返回 {"targetSeat":2,"reason":"我今晚守x号，原因是..."}；空守返回 {"targetSeat":null,"reason":"今晚我空守，原因是..."}。reason 可选。',
  ].filter(Boolean).join('\n');
}

/** 女巫解药 */
export function buildSaveActionPrompt(victimId: number, isSelf: boolean, canSelfSave: boolean): string {
  const lines = [
    `今晚狼刀目标是 ${victimId} 号。你还有解药。`,
    isSelf && canSelfSave ? '首夜允许自救。' : '不允许自救。',
    isSelf
      ? '是否使用解药自救？只返回标准 JSON 对象：{"use":true,"reason":""} 或 {"use":false,"reason":null}。reason 可以填写简短原因；不行动时可为 null。'
      : '是否使用解药救人？只返回标准 JSON 对象：{"use":true,"reason":"我选择救x号，原因是..."} 或 {"use":false,"reason":null}。reason 可以填写简短原因；不行动时可为 null。'
  ].filter(Boolean);
  return lines.join('\n\n');
}

/** 女巫毒药 */
export function buildPoisonActionPrompt(validIds: number[]): string {
  return [
    '你还有毒药。请选择是否使用毒药；可以填写 reason 简短说明原因。',
    `可选目标座位号：${validIds.join('、') || '无'}`,
    '只返回标准 JSON 对象，不要输出 Markdown、解释或多余文本。',
    '示例：{"use":true,"targetSeat":2,"reason":"我选择毒杀x号，原因是..."}。'
  ].join('\n\n');
}

/** 猎人开枪 */
export function buildHunterShootActionPrompt(validIds: number[] = []): string {
  return [
    '你是猎人，已出局。请选择是否开枪带走一名玩家。',
    `可选目标座位号：${validIds.join('、')}。`,
    '只返回标准 JSON 对象：开枪返回 {"targetSeat":2}；不开枪返回 {"targetSeat":null}。'
  ].join('\n');
}

/** 狼人自爆 */
export function buildSelfDestructActionPrompt(publicContext: string, speechText: string, validTargetIds: number[] = []): string {
  const targetInstruction = validTargetIds.length
    ? [
        `白狼王自爆时必须选择 1 名当前存活且非自己的玩家带走，可选目标：${validTargetIds.join('、')}。`,
        '白狼王自爆示例：{"use":true,"text":"自爆发言","targetSeat":2}。'
      ].join('\n')
    : '普通狼人自爆不带人，targetSeat 必须为 null。';
  return [
    targetInstruction,
    '你是狼人，当前处于白天公开流程。你可以选择是否发动自爆。',
    '自爆效果：你立即出局，本轮白天发言/投票中止，流程进入后续胜负检查或夜晚。',
    publicContext ? `当前公开信息：\n${publicContext}` : '',
    `你刚才的公开发言：${speechText || '暂无'}`,
    '建议在继续发言会明显暴露狼队、或自爆能保护狼队/打断关键归票时才使用。',
    '只返回JSON对象：{"use":false,"text":""} 或 {"use":true,"text":"自爆遗言"}。'
  ].filter(Boolean).join('\n\n');
}

// ---- 投票/竞选提示 ----

/** 狼人夜聊后刀口投票 */
export function buildWolfVotePrompt(): string {
  return '狼人夜晚刀口投票。请根据本次提示中的狼队夜聊内容选择今晚击杀目标。';
}

/** 白天放逐投票 */
export const DAY_VOTE_PROMPT = '请选择你要放逐的玩家。';

/** 警长竞选报名 */
export const SHERIFF_SIGNUP_PROMPT = '警长竞选开始。请选择是否竞选警长。';

/** 警长退水 */
export function buildSheriffWithdrawPrompt(): string {
  return [
    '你的警上竞选发言已经结束。请根据所有警上候选人的发言内容，判断是否退水退出警长竞选。',
    '判断标准：如果你的发言明显弱于其他候选人，或你认为其他候选人更适合担任警长，可以选择退水。',
  ].join('\n\n');
}

/** 警长投票 */
export const SHERIFF_VOTE_PROMPT = '警长竞选投票，请从候选人中选择警长。';
