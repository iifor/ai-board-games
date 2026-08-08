import { Request, Response } from 'express';
import * as service from './service';
import { formatSuccess } from '../../utils/response';
import type { GameListFilters } from './repository';

async function listGames(req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.listGames(req.query as unknown as GameListFilters)));
}

async function getGame(req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.getGame(req.params.id as string)));
}

async function deleteGame(req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.deleteGame(req.params.id as string)));
}

async function importGame(req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.saveGameRecord(req.body)));
}

async function getStats(_req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.getAdminStats()));
}

export { listGames, getGame, deleteGame, importGame, getStats };
