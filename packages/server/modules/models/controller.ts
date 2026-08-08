import { Request, Response } from 'express';
import * as service from './service';
import { formatSuccess } from '../../utils/response';

async function getModels(_req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.listModels()));
}

async function getProviderModels(req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.listModelsByProvider(Number((req.params as Record<string, string>).providerId))));
}

async function getModel(req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.getModel(Number((req.params as Record<string, string>).id))));
}

async function createModel(req: Request, res: Response): Promise<void> {
  res.status(201).json(formatSuccess(await service.createModel(req.body as Record<string, unknown>)));
}

async function createProviderModel(req: Request, res: Response): Promise<void> {
  res.status(201).json(formatSuccess(await service.createModel({ ...(req.body as Record<string, unknown>), providerId: Number((req.params as Record<string, string>).providerId) })));
}

async function updateModel(req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.updateModel(Number((req.params as Record<string, string>).id), req.body as Record<string, unknown>)));
}

async function deleteModel(req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.deleteModel(Number((req.params as Record<string, string>).id))));
}

async function testModel(req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.testModelConnection(Number((req.params as Record<string, string>).id))));
}

export { getModels, getProviderModels, getModel, createModel, createProviderModel, updateModel, deleteModel, testModel };
