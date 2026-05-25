import { Request, Response, NextFunction } from 'express';
import * as service from './service';
import { formatSuccess } from '../../utils/response';

function getPlayers(req: Request, res: Response): void {
  res.json(formatSuccess(service.listPlayers()));
}

function getPlayer(req: Request, res: Response): void {
  res.json(formatSuccess(service.getPlayer(req.params.id as string)));
}

function createPlayer(req: Request, res: Response): void {
  res.status(201).json(formatSuccess(service.createPlayer(req.body)));
}

function updatePlayer(req: Request, res: Response): void {
  res.json(formatSuccess(service.updatePlayer(req.params.id as string, req.body)));
}

function setPlayerEnabled(req: Request, res: Response): void {
  res.json(formatSuccess(service.setPlayerEnabled(req.params.id as string, (req.body as Record<string, unknown>).enabled as boolean)));
}

function reorderPlayers(req: Request, res: Response): void {
  res.json(formatSuccess(service.reorderPlayers(req.body as Array<{ id: number; sortOrder?: number; sort_order?: number }>)));
}

async function debugPlayerChat(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(formatSuccess(await service.debugPlayerChat(req.params.id as string, req.body as { message?: string; history?: Array<{ role: string; content: string }> })));
  } catch (error) {
    next(error);
  }
}

function deletePlayer(req: Request, res: Response): void {
  res.json(formatSuccess(service.deletePlayer(req.params.id as string)));
}

export { getPlayers, getPlayer, createPlayer, updatePlayer, setPlayerEnabled, reorderPlayers, debugPlayerChat, deletePlayer };
