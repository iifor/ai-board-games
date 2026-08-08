import { Request, Response, NextFunction } from 'express';
import * as service from './service';
import { formatSuccess } from '../../utils/response';

async function getPlayers(req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.listPlayers()));
}

async function getPlayer(req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.getPlayer(req.params.id as string)));
}

async function createPlayer(req: Request, res: Response): Promise<void> {
  res.status(201).json(formatSuccess(await service.createPlayer(req.body)));
}

async function updatePlayer(req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.updatePlayer(req.params.id as string, req.body)));
}

async function setPlayerEnabled(req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.setPlayerEnabled(req.params.id as string, (req.body as Record<string, unknown>).enabled as boolean)));
}

async function reorderPlayers(req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.reorderPlayers(req.body as Array<{ id: number; sortOrder?: number; sort_order?: number }>)));
}

async function debugPlayerChat(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(formatSuccess(await service.debugPlayerChat(req.params.id as string, req.body as { message?: string; history?: Array<{ role: string; content: string }> })));
  } catch (error) {
    next(error);
  }
}

async function deletePlayer(req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.deletePlayer(req.params.id as string)));
}

export { getPlayers, getPlayer, createPlayer, updatePlayer, setPlayerEnabled, reorderPlayers, debugPlayerChat, deletePlayer };
