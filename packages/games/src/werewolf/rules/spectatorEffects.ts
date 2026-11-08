import type { LogDraft } from '@battle/engine';
import type { NightDeathCause } from '../state';

export function spectatorEffect(effect: string, target: number, title: string): LogDraft {
  return { kind: 'revealed', channel: 'spectator', text: `${target}号 · ${title}`, data: { effect, target, title } };
}

const DEATH_EFFECT: Record<NightDeathCause, readonly [string, string]> = {
  wolf: ['blade', '狼刀命中'], poison: ['poison', '毒药生效'], reflect: ['duel', '恶灵反伤'],
  stalker: ['blade', '暗杀命中'], charm: ['bond', '魅惑连锁'], dream: ['dream', '摄梦生效'],
  merchant: ['trade', '交易反噬'], lover: ['bond', '情侣殉情'], third_kill: ['blade', '第三方击杀'], hunt: ['shot', '狩猎结算'],
};

export function nightDeathEffect(target: number, cause: NightDeathCause): LogDraft {
  const [effect, title] = DEATH_EFFECT[cause];
  return spectatorEffect(effect, target, title);
}
