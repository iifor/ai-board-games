import { Request, Response } from 'express';
import * as service from './service';
import { formatSuccess } from '../../utils/response';

function getModelProviders(_req: Request, res: Response): void {
  res.json(formatSuccess(service.listModelProviders()));
}

function getModelProvider(req: Request, res: Response): void {
  res.json(formatSuccess(service.getModelProvider(req.params.id as string)));
}

function createModelProvider(req: Request, res: Response): void {
  res.status(201).json(formatSuccess(service.createModelProvider(req.body)));
}

function updateModelProvider(req: Request, res: Response): void {
  res.json(formatSuccess(service.updateModelProvider(req.params.id as string, req.body)));
}

function deleteModelProvider(req: Request, res: Response): void {
  res.json(formatSuccess(service.deleteModelProvider(req.params.id as string)));
}

export {
  getModelProviders,
  getModelProvider,
  createModelProvider,
  updateModelProvider,
  deleteModelProvider
};
