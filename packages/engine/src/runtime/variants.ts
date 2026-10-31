import type { CompiledGame } from '../compiler/compile';
import { EngineInputError } from '../errors';
import type { VariantContext } from '../spec/context';
import type { VariantSpec } from '../spec/types';

export function variantContext(game: CompiledGame, key: string | null): VariantContext | null {
  if (key === null) return null;
  const variant = game.spec.variants?.[key];
  if (!variant) throw new Error(`变体 ${key} 不存在`);
  return { key, name: variant.name, config: variant.config ?? {} };
}

/** 开局时解析变体：未定义变体的游戏不接受 variant；定义了则缺省取 defaultVariant */
export function resolveVariant(game: CompiledGame, requested: string | undefined): { key: string | null; spec: VariantSpec | null } {
  const variants = game.spec.variants;
  if (!variants) {
    if (requested !== undefined) throw new EngineInputError(`${game.spec.title}没有玩法变体`);
    return { key: null, spec: null };
  }
  const key = requested ?? game.spec.defaultVariant;
  const spec = key === undefined ? undefined : variants[key];
  if (key === undefined || !spec) throw new EngineInputError(`未知的玩法变体：${requested ?? '(未指定)'}`);
  return { key, spec };
}
