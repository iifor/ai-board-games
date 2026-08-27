import crypto from 'crypto';
import type { Request, Response } from 'express';
import { formatSuccess } from '../../utils/response';
import * as service from './service';
import type { GameVariantInput, GameVariantUpdate, VariantMutationContext } from './types';

function mutationContext(req: Request, res: Response): VariantMutationContext {
  const requestId = String(req.headers['x-request-id'] || crypto.randomUUID());
  return { audit: { actorAdminId: Number(res.locals.user?.id) || null, requestId,
    ipAddress: req.ip || null, userAgent: String(req.headers['user-agent'] || '') } };
}

async function listVariants(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as { gameType?: string; includeDisabled: boolean };
  res.json(formatSuccess(await service.listVariants(query.gameType, query.includeDisabled)));
}
async function getVariant(req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.getVariant(Number(req.params.id))));
}
async function createVariant(req: Request, res: Response): Promise<void> {
  res.status(201).json(formatSuccess(await service.createVariant(req.body as GameVariantInput,
    mutationContext(req, res))));
}
async function updateVariant(req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.updateVariant(Number(req.params.id), req.body as GameVariantUpdate,
    mutationContext(req, res))));
}
async function disableVariant(req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.disableVariant(Number(req.params.id), Number(req.body.revision),
    mutationContext(req, res))));
}

export { listVariants, getVariant, createVariant, updateVariant, disableVariant };
