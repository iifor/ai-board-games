export const SKILL_DESCRIPTIONS: Record<string, string> = {
  kill: '夜晚击杀一名存活玩家。',
  inspectFaction: '夜晚查验一名玩家阵营。',
  guard: '夜晚守护一名玩家，不能连续两晚守护同一人。',
  save: '女巫解药，可救今晚被狼人袭击的玩家。',
  poison: '女巫毒药，可毒杀一名玩家。',
  shootOnDeath: '死亡或放逐时可以开枪带走一名玩家。',
  selfDestruct: '狼人白天可自爆，立即出局并中止当前白天流程。',
  surviveExileOnce: '首次被白天放逐时翻牌免死并失去投票权。',
  chooseMaster: '首夜选择一名玩家作为主人。',
  silence: '夜晚禁言一名玩家。',
  duel: '白天发起一次骑士决斗。',
  hug: '夜晚抱住一名玩家，使其当晚特殊能力失效。',
  stalk: '若白天投票目标未被放逐，下一夜可暗杀该目标。',
  charm: '夜晚魅惑一名玩家，狼美人死亡时带走魅惑目标。',
  inspectRoleType: '夜晚查验一名好人是神职还是平民。',
  fear: '夜晚恐惧一名玩家，使其当晚技能失效。',
  dream: '夜晚摄梦一名玩家。',
  swap: '夜晚交换两名玩家号码。',
  mark: '夜晚标记一名玩家，限制狼队刀口范围。',
  soloKill: '夜晚单独击杀一名非狼玩家。',
  curse: '夜晚诅咒一名玩家，使其次日放逐投票多一票。',
  blackMerchantGift: '夜晚赠送一次临时查验、毒药或死亡开枪能力。',
  youngerBrotherKill: '狼兄死亡后的下一夜，狼弟单独击杀一名非狼玩家。',
  treeSurviveWolfHit: '大树被动承受狼人击杀。',
  bearRoar: '白天公开熊是否咆哮。',
  infect: '夜晚全局一次感染狼队刀口，成功时目标不死并加入狼人阵营。',
  inspectRole: '夜晚查验一名玩家的具体角色身份。',
  request: '首夜祈求一名玩家，根据对方身份获得对应能力。',
  stealRole: '首夜从盗贼备选身份中选择一张。',
  linkLovers: '首夜选择两名玩家成为情侣。',
  succubusLink: '首夜魅魔自连一名好人组成第三方。',
  ghostBrideLink: '首夜选择新郎和见证人组成鬼魂新娘第三方。',
  ghostBrideChat: '鬼魂新娘阵营夜间私聊。',
  ghostBrideKill: '无普通狼人存活后，鬼魂新娘阵营夜间击杀一名非第三方玩家。',
  freeze: '夜晚冰冻一名玩家。',
  foxInspect: '夜晚查验三连座位中是否有狼。',
  blastVoters: '被放逐时炸死投票给自己的玩家。',
  loseTailOnGoodDeath: '好人死亡时扣除九尾狐尾巴。',
  voteOnly: '白天投票。',
  speakOnly: '白天发言。',
};

export function buildTargetJsonContract(
  validIds: number[],
  options: { reason?: 'required' | 'optional' | 'none'; nullable?: boolean } = {},
): string {
  const reason = options.reason || 'none';
  const targetExample = options.nullable ? 'number|null' : 'number';
  return [
    '只返回标准 JSON 对象，不要输出 Markdown、解释或多余文本。',
    `可选目标座位号：${validIds.join('、') || '无'}。`,
    `格式：{"targetSeat":${targetExample}${reason === 'none' ? '' : ',"reason":"简短原因"'}}。`,
    options.nullable ? `不行动：{"targetSeat":null${reason === 'none' ? '' : ',"reason":null'}}。` : '',
    reason === 'optional' ? 'reason 可选。' : reason === 'required' ? 'reason 必须填写。' : '',
  ].filter(Boolean).join('\n');
}

export function buildKillActionPrompt(validIds: number[] = []): string {
  return actionPrompt('狼人夜晚行动，请选择今晚击杀目标或空刀。', validIds, true);
}

export function buildInspectFactionActionPrompt(validIds: number[] = []): string {
  return actionPrompt('预言家夜晚行动，请选择一名玩家查验阵营。', validIds);
}

export function buildGuardActionPrompt(validIds: number[] = []): string {
  return actionPrompt('守卫夜晚行动，请选择守护目标或空守，不能连续两晚守护同一人。', validIds, true);
}

export function buildSaveActionPrompt(victimId: number, isSelf: boolean, canSelfSave: boolean): string {
  const selfRule = isSelf ? (canSelfSave ? '本局允许首夜自救。' : '本局不允许自救。') : '';
  return [
    `今晚狼刀目标是 ${victimId} 号，是否使用解药（antidote）？`,
    selfRule,
    '只返回 JSON：{"use":true,"reason":"简短原因"} 或 {"use":false,"reason":null}。',
    'reason 可以填写简短原因；不使用时为 null。',
  ].filter(Boolean).join('\n');
}

export function buildPoisonActionPrompt(validIds: number[]): string {
  return [
    '女巫毒药行动，请决定是否使用毒药。',
    buildTargetJsonContract(validIds, { reason: 'optional', nullable: true }).replace('"targetSeat"', '"targetSeat"'),
    '使用时返回 {"use":true,"targetSeat":2,"reason":"简短原因"}；不用时返回 {"use":false,"targetSeat":null,"reason":null}。',
  ].join('\n');
}

export function buildHunterShootActionPrompt(validIds: number[] = []): string {
  return [
    '你已出局，可选择是否开枪带走一名玩家。',
    `可选目标座位号：${validIds.join('、') || '无'}。`,
    '只返回标准 JSON 对象，不要输出 Markdown、解释或多余文本。',
    '开枪：{"targetSeat":2}；不行动：{"targetSeat":null}。',
  ].join('\n');
}

export function buildSelfDestructActionPrompt(publicContext: string, speechText: string, validTargetIds: number[] = []): string {
  return [
    '你可以选择是否自爆。',
    validTargetIds.length ? `白狼王自爆可带走目标：${validTargetIds.join('、')}。` : '普通狼人自爆不带人。',
    publicContext ? `公开信息：\n${publicContext}` : '',
    speechText ? `刚才发言：${speechText}` : '',
    '只返回 JSON：{"use":false,"text":""} 或 {"use":true,"text":"自爆发言","targetSeat":2}。',
  ].filter(Boolean).join('\n\n');
}

export const buildHybridChooseMasterPrompt = (validIds: number[] = []): string => actionPrompt('混血儿首夜选择主人。', validIds);
export const buildElderSilencePrompt = (validIds: number[] = []): string => actionPrompt('禁言长老选择明天被禁言的玩家。', validIds);
export const buildKnightDuelPrompt = (validIds: number[] = []): string => actionPrompt('骑士可发起一次决斗。', validIds, true);
export const buildButterflyHugPrompt = (validIds: number[] = []): string => actionPrompt('花蝴蝶选择今晚抱住的玩家。', validIds, true);

export function buildStalkerAssassinatePrompt(targetId: number): string {
  return [
    `你可以暗杀昨天投过且未被放逐的 ${targetId} 号。`,
    `只返回 JSON：{"use":true,"targetSeat":${targetId},"reason":"简短原因"} 或 {"use":false,"targetSeat":null,"reason":null}。`,
  ].join('\n');
}

export const buildWolfBeautyCharmPrompt = (validIds: number[] = []): string => actionPrompt('狼美人选择今晚魅惑的玩家。', validIds, true);
export const buildDemonInspectPrompt = (validIds: number[] = []): string => actionPrompt('恶魔选择一名好人查验其是神职还是平民。', validIds);
export const buildNightmareFearPrompt = (validIds: number[] = []): string => actionPrompt('梦魇选择今晚恐惧的玩家。', validIds, true);
export const buildDreamerDreamPrompt = (validIds: number[] = []): string => actionPrompt('摄梦人选择今晚摄梦的玩家。', validIds);
export const buildMagicianSwapPrompt = (validIds: number[] = []): string => actionPrompt('魔术师选择两名玩家交换号码，返回 targetSeat 和 secondTargetSeat。', validIds, true);
export const buildFortuneTellerMarkPrompt = (validIds: number[] = []): string => actionPrompt('占卜师可全局一次标记一名玩家。', validIds, true);
export const buildBigBadWolfKillPrompt = (validIds: number[] = []): string => actionPrompt('大灰狼可单独击杀一名非狼玩家。', validIds, true);
export const buildCrowCursePrompt = (validIds: number[] = []): string => actionPrompt('乌鸦选择今晚诅咒的玩家。', validIds, true);

export function buildBearTamerRoarPrompt(adjacentWolfIds: number[] = []): string {
  return [
    '驯熊师白天提示，请根据服务端结果返回熊是否咆哮。',
    `邻座狼人：${adjacentWolfIds.join('、') || '无'}。`,
    '只返回 JSON：{"roaring":true/false,"adjacentWolfIds":[数字]}。',
  ].join('\n');
}

export function buildWolfVotePrompt(): string {
  return '狼队夜晚刀口投票，请根据夜聊内容选择今晚击杀目标。';
}

export const DAY_VOTE_PROMPT = '请选择你要放逐的玩家。';
export const SHERIFF_SIGNUP_PROMPT = '警长竞选开始，请选择是否竞选警长。';
export const SHERIFF_VOTE_PROMPT = '警长竞选投票，请从候选人中选择警长。';

export function buildSheriffWithdrawPrompt(): string {
  return '请判断是否退水退出警长竞选。只返回 JSON：{"withdraw":true} 或 {"withdraw":false}。';
}

function actionPrompt(title: string, validIds: number[], nullable = false): string {
  return [
    title,
    buildTargetJsonContract(validIds, { reason: 'optional', nullable }),
  ].join('\n');
}
