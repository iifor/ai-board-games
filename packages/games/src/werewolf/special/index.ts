import type { PromptTemplate } from '@battle/engine';
import type { WerewolfPhases, WerewolfTriggers } from '../phases/types';
import type { DawnStep, NightStep } from '../rules/types';
import { bearSpecial } from './bear';
import { bearTamerSpecial } from './bearTamer';
import { bigBadWolfSpecial } from './bigBadWolf';
import { bigTreeSpecial } from './bigTree';
import { blackMerchantSpecial } from './blackMerchant';
import { bombmanSpecial } from './bombman';
import { butterflySpecial } from './butterfly';
import { crowSpecial } from './crow';
import { cupidSpecial } from './cupid';
import { demonSpecial } from './demon';
import { demonHunterSpecial } from './demonHunter';
import { dreamerSpecial } from './dreamer';
import { evilKnightSpecial } from './evilKnight';
import { fortuneTellerSpecial } from './fortuneTeller';
import { foxSpecial } from './fox';
import { ghostBrideSpecial } from './ghostBride';
import { giftsSpecial } from './gifts';
import { guardSpecial } from './guard';
import { heavenlyEyeSpecial } from './heavenlyEye';
import { hiddenWolfSpecial } from './hiddenWolf';
import { hybridSpecial } from './hybrid';
import { illusionistSpecial } from './illusionist';
import { knightSpecial } from './knight';
import { loversSpecial } from './lovers';
import { magicianSpecial } from './magician';
import { magicWolfSpecial } from './magicWolf';
import { nightmareSpecial } from './nightmare';
import { nineTailedFoxSpecial } from './nineTailedFox';
import { oldRogueSpecial } from './oldRogue';
import { penguinSpecial } from './penguin';
import { requesterSpecial } from './requester';
import { saplingSpecial } from './sapling';
import { silenceElderSpecial } from './silenceElder';
import { spiritWolfSpecial } from './spiritWolf';
import { stalkerSpecial } from './stalker';
import { succubusSpecial } from './succubus';
import { thiefSpecial } from './thief';
import { thirdPartyKillSpecial } from './thirdPartyKill';
import type { ExileHooks, SpecialDescriptor, VictoryHooks } from './types';
import { whiteWolfKingSpecial } from './whiteWolfKing';
import { wildChildSpecial } from './wildChild';
import { wolfBeautySpecial } from './wolfBeauty';
import { wolfBrothersSpecial } from './wolfBrothers';
import { wolfKingSpecial } from './wolfKing';
import { wolfSeedSpecial } from './wolfSeed';
import { wolfWitchSpecial } from './wolfWitch';

// 特殊角色登记表：由各模块的描述符（special/types.ts）汇总，核心流程只读取这里，不引用具体模块。
// 依赖方向：基础规则（rules/ 中除 nightResolution、dawn、victory、day 之外的模块）与 special/* 不得引用本文件；
// 消费方只有上述四个结算管线、roleSpecs.ts、spec.ts 与 triggers.ts。
// 新增特殊角色：写好 special/<role>.ts 并导出描述符；在 roles.ts 登记阵营、屠边类别与特性；把描述符加入 ALL；
// 登记了 nightStep / dawnStep / linkTriggers / deathTriggers 的，再按口径把它插到下面对应顺序表的位置（漏列会在加载时报错）。

/** 全部模块：决定 prompts、phases 与胜负 / 放逐钩子的汇总顺序（这些顺序不影响行为） */
const ALL: readonly SpecialDescriptor[] = [
  guardSpecial, whiteWolfKingSpecial, hybridSpecial, silenceElderSpecial, knightSpecial, stalkerSpecial, butterflySpecial,
  wolfBeautySpecial, demonSpecial, evilKnightSpecial, nightmareSpecial, oldRogueSpecial, wolfKingSpecial, dreamerSpecial,
  magicianSpecial, fortuneTellerSpecial, bigBadWolfSpecial, hiddenWolfSpecial, crowSpecial, bearTamerSpecial, wildChildSpecial,
  bombmanSpecial, nineTailedFoxSpecial, giftsSpecial, blackMerchantSpecial, bigTreeSpecial, wolfBrothersSpecial, bearSpecial,
  penguinSpecial, foxSpecial, wolfSeedSpecial, heavenlyEyeSpecial, requesterSpecial, thiefSpecial, cupidSpecial, succubusSpecial,
  ghostBrideSpecial, loversSpecial, thirdPartyKillSpecial, saplingSpecial, magicWolfSpecial, demonHunterSpecial, spiritWolfSpecial,
  wolfWitchSpecial, illusionistSpecial,
];

/** 合并各模块按名字登记的条目，重名即配置错误 */
function merge<T>(label: string, pick: (item: SpecialDescriptor) => Readonly<Record<string, T>> | undefined): Readonly<Record<string, T>> {
  const merged: Record<string, T> = {};
  for (const item of ALL) {
    for (const [key, value] of Object.entries(pick(item) ?? {})) {
      if (Object.hasOwn(merged, key)) throw new Error(`特殊角色模块 ${item.key} 的${label}重名：${key}`);
      merged[key] = value;
    }
  }
  return merged;
}

/** 按口径顺序取出各模块登记的步骤；登记了步骤却没有列入顺序表（或列入了却没登记）都是配置错误 */
function ordered<T>(label: string, order: readonly SpecialDescriptor[], pick: (item: SpecialDescriptor) => T | undefined): T[] {
  const listed = new Set(order);
  const missing = ALL.filter((item) => pick(item) !== undefined && !listed.has(item)).map((item) => item.key);
  if (missing.length) throw new Error(`${label}顺序表漏掉了模块：${missing.join('、')}`);
  return order.map((item) => {
    const value = pick(item);
    if (value === undefined) throw new Error(`${label}顺序表中的模块 ${item.key} 没有登记对应的步骤`);
    return value;
  });
}

export const specialPrompts: Readonly<Record<string, PromptTemplate>> = merge('模板', (item) => item.prompts);
export const specialIdentities: Readonly<Record<string, PromptTemplate>> = merge('身份模板', (item) => item.identities);
export const specialPhases: WerewolfPhases = merge('阶段', (item) => item.phases);

/**
 * 夜间结算步骤，接在狼刀、毒药（rules/nightResolution.ts）之后依次执行：
 * 恶灵骑士反伤 → 潜行者暗杀 → 大灰狼单独击杀 → 狼弟单独击杀 → 第三方击杀 → 猎魔人狩猎 → 灵狼庇护 → 幻象替死 → 大树挡刀
 * → 种狼感染 → 黑商交易反噬 → 摄梦而死 → 狼美人殉情 → 情侣殉情。
 * 恶灵骑士反伤排在狼刀、毒药之后（反伤对象已死亡则不消耗反伤）；猎魔人的狩猎排在各种击杀之后，灵狼的庇护再挡下其中的狼刀与毒药，
 * 幻象随后替幻术师承受余下的狼刀或毒药；大树要看全部狼刀，排在各种击杀之后；摄梦死亡要知道摄梦人当晚是否死亡，排在其他死亡之后；
 * 殉情最后，覆盖前面所有的死亡。
 */
export const specialNightSteps: readonly NightStep[] = ordered('夜间结算', [
  evilKnightSpecial, stalkerSpecial, bigBadWolfSpecial, wolfBrothersSpecial, thirdPartyKillSpecial, demonHunterSpecial, spiritWolfSpecial,
  illusionistSpecial, bigTreeSpecial, wolfSeedSpecial, blackMerchantSpecial, dreamerSpecial, wolfBeautySpecial, loversSpecial,
], (item) => item.nightStep);

/** 天亮时与死讯一起公布的信息，按顺序接在死讯之后：禁言 → 驯熊师的熊咆哮 → 动物园的熊咆哮 */
export const specialDawnSteps: readonly DawnStep[] = ordered('天亮公布', [silenceElderSpecial, bearTamerSpecial, bearSpecial], (item) => item.dawnStep);

/**
 * 殉情类触发器：排在遗言之后、所有开枪 / 带人之前。触发器链按声明顺序依次执行、互不插队，
 * 所以同一次出局引发的殉情总是先于开枪与带人的结算（对自己的另一半开枪，这一枪不再生效）。
 */
export const specialLinkTriggers: WerewolfTriggers = ordered('殉情触发器', [wolfBeautySpecial, loversSpecial], (item) => item.linkTriggers).flat();

/**
 * 出局后的其他特殊处理，排在猎人开枪之后、移交警徽之前（声明顺序即执行顺序）：
 * 中性开枪（狼王局）→ 额外的枪 → 灵狼翻牌带人 → 白狼王带人 → 魔狼封印 → 炸弹人引爆 → 野孩子变狼 → 隐狼随狼队出局 → 九尾狐失去全部尾巴
 * → 树苗全部出局时大树随之出局 → 老流氓到期出局 → 大树倒下 → 记录狼兄出局。
 */
export const specialDeathTriggers: WerewolfTriggers = ordered('出局触发器', [
  wolfKingSpecial, giftsSpecial, spiritWolfSpecial, whiteWolfKingSpecial, magicWolfSpecial, bombmanSpecial, wildChildSpecial,
  hiddenWolfSpecial, nineTailedFoxSpecial, saplingSpecial, oldRogueSpecial, bigTreeSpecial, wolfBrothersSpecial,
], (item) => item.deathTriggers).flat();

/** 胜负判定的钩子（丘比特、隐狼、混血儿），见 rules/victory.ts */
export const specialVictoryHooks: readonly VictoryHooks[] = ALL.flatMap((item) => (item.victory ? [item.victory] : []));

/** 放逐环节的钩子（乌鸦、魔狼），见 rules/day.ts */
export const specialExileHooks: readonly ExileHooks[] = ALL.flatMap((item) => (item.exile ? [item.exile] : []));
