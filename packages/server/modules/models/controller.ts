import { Request, Response } from 'express';
import * as service from './service';
import { formatSuccess } from '../../utils/response';

function getModels(_req: Request, res: Response): void {
  res.json(formatSuccess(service.listModels()));
}

function getProviderModels(req: Request, res: Response): void {
  res.json(formatSuccess(service.listModelsByProvider(Number((req.params as Record<string, string>).providerId))));
}

function getModel(req: Request, res: Response): void {
  res.json(formatSuccess(service.getModel(Number((req.params as Record<string, string>).id))));
}

function createModel(req: Request, res: Response): void {
  res.status(201).json(formatSuccess(service.createModel(req.body as Record<string, unknown>)));
}

function createProviderModel(req: Request, res: Response): void {
  res.status(201).json(formatSuccess(service.createModel({ ...(req.body as Record<string, unknown>), providerId: Number((req.params as Record<string, string>).providerId) })));
}

function updateModel(req: Request, res: Response): void {
  res.json(formatSuccess(service.updateModel(Number((req.params as Record<string, string>).id), req.body as Record<string, unknown>)));
}

function deleteModel(req: Request, res: Response): void {
  res.json(formatSuccess(service.deleteModel(Number((req.params as Record<string, string>).id))));
}

async function testModel(req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.testModelConnection(Number((req.params as Record<string, string>).id))));
}

export { getModels, getProviderModels, getModel, createModel, createProviderModel, updateModel, deleteModel, testModel };
