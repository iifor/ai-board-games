import { getDbExecutor } from '../../db';
import { AppError, ErrorCodes } from '../../utils/errors';
import { getGameEngine } from '../engine-registry';
import { appendAudit } from '../admin-audit';
import * as repository from './repository';
import type { GameVariantInput, GameVariantUpdate, VariantMutationContext } from './types';

function assertRegisteredDefinition(gameType: string, definitionVersion: string): void {
  if (!getGameEngine().getDefinition(gameType, definitionVersion)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR,
      `未注册游戏定义：${gameType}@${definitionVersion}`, 400);
  }
}

function listVariants(gameType?: string, includeDisabled = false) {
  return repository.listVariants(gameType, includeDisabled);
}

async function resolveEnabledVariant(gameType: string, variantKey: string) {
  const variant = await repository.findEnabledVariant(gameType, variantKey);
  if (!variant) throw new AppError(ErrorCodes.NOT_FOUND, '游戏模式不存在或已停用', 404);
  assertRegisteredDefinition(variant.gameType, variant.definitionVersion);
  return variant;
}

async function getVariant(id: number) {
  const variant = await repository.findVariantById(id);
  if (!variant) throw new AppError(ErrorCodes.NOT_FOUND, '游戏模式不存在', 404);
  return variant;
}

async function createVariant(input: GameVariantInput, context: VariantMutationContext) {
  assertRegisteredDefinition(input.gameType, input.definitionVersion);
  try {
    return await getDbExecutor().withTransaction(async (transaction) => {
      const created = await repository.createVariant(input, transaction);
      await appendAudit(context.audit, { action: 'game_variant.created', entityType: 'game_variant',
        entityId: String(created.id), after: created }, transaction);
      return created;
    });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new AppError(ErrorCodes.ALREADY_EXISTS, '同一游戏下的模式标识已存在', 409);
    }
    throw error;
  }
}

async function updateVariant(id: number, input: GameVariantUpdate, context: VariantMutationContext) {
  return getDbExecutor().withTransaction(async (transaction) => {
    const before = await repository.findVariantById(id, transaction, true);
    if (!before) throw new AppError(ErrorCodes.NOT_FOUND, '游戏模式不存在', 404);
    assertRegisteredDefinition(input.gameType || before.gameType,
      input.definitionVersion || before.definitionVersion);
    const updated = await repository.updateVariant(id, input, transaction);
    if (!updated) throw new AppError(ErrorCodes.VALIDATION_ERROR, '游戏模式已被他人修改，请刷新后重试', 409);
    await appendAudit(context.audit, { action: 'game_variant.updated', entityType: 'game_variant',
      entityId: String(id), before, after: updated }, transaction);
    return updated;
  });
}

async function disableVariant(id: number, revision: number, context: VariantMutationContext) {
  return updateVariant(id, { revision, enabled: false }, context);
}

export { listVariants, getVariant, resolveEnabledVariant, createVariant, updateVariant, disableVariant };
