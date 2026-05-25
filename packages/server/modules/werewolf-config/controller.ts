import { Request, Response } from 'express';
import * as service from './service';
import { formatSuccess } from '../../utils/response';

function getRoles(_req: Request, res: Response): void {
  res.json(formatSuccess(service.listWerewolfRoles()));
}

function getRole(req: Request, res: Response): void {
  res.json(formatSuccess(service.getWerewolfRole(String(req.params.id))));
}

function upsertRole(req: Request, res: Response): void {
  res.json(formatSuccess(service.upsertWerewolfRole(req.body)));
}

function deleteRole(req: Request, res: Response): void {
  res.json(formatSuccess(service.deleteWerewolfRole(String(req.params.id))));
}

function getModes(_req: Request, res: Response): void {
  res.json(formatSuccess(service.listWerewolfModes()));
}

function getMode(req: Request, res: Response): void {
  res.json(formatSuccess(service.getWerewolfMode(String(req.params.id))));
}

function upsertMode(req: Request, res: Response): void {
  res.json(formatSuccess(service.upsertWerewolfMode(req.body)));
}

function deleteMode(req: Request, res: Response): void {
  res.json(formatSuccess(service.deleteWerewolfMode(String(req.params.id))));
}

export { getRoles, getRole, upsertRole, deleteRole, getModes, getMode, upsertMode, deleteMode };
