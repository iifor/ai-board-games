import { Request, Response } from 'express';
import * as service from './service';
import { formatSuccess } from '../../utils/response';

async function getRoles(_req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.listWerewolfRoles()));
}

async function getRole(req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.getWerewolfRole(String(req.params.id))));
}

async function upsertRole(req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.upsertWerewolfRole(req.body)));
}

async function deleteRole(req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.deleteWerewolfRole(String(req.params.id))));
}

async function getModes(_req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.listWerewolfModes()));
}

async function getMode(req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.getWerewolfMode(String(req.params.id))));
}

async function upsertMode(req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.upsertWerewolfMode(req.body)));
}

async function deleteMode(req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.deleteWerewolfMode(String(req.params.id))));
}

export { getRoles, getRole, upsertRole, deleteRole, getModes, getMode, upsertMode, deleteMode };
