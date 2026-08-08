import { Request, Response } from 'express';
import * as service from './service';
import { formatSuccess } from '../../utils/response';

async function getModelProviders(_req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.listModelProviders()));
}

async function getModelProvider(req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.getModelProvider(req.params.id as string)));
}

async function createModelProvider(req: Request, res: Response): Promise<void> {
  res.status(201).json(formatSuccess(await service.createModelProvider(req.body)));
}

async function updateModelProvider(req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.updateModelProvider(req.params.id as string, req.body)));
}

async function deleteModelProvider(req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.deleteModelProvider(req.params.id as string)));
}

export {
  getModelProviders,
  getModelProvider,
  createModelProvider,
  updateModelProvider,
  deleteModelProvider
};
