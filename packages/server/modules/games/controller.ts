import { Request, Response } from 'express';
import * as service from './service';
import { formatSuccess } from '../../utils/response';
import type { GameListFilters } from './repository';

function listGames(req: Request, res: Response): void {
  res.json(formatSuccess(service.listGames(req.query as unknown as GameListFilters)));
}

function getGame(req: Request, res: Response): void {
  res.json(formatSuccess(service.getGame(req.params.id as string)));
}

function deleteGame(req: Request, res: Response): void {
  res.json(formatSuccess(service.deleteGame(req.params.id as string)));
}

function importGame(req: Request, res: Response): void {
  res.json(formatSuccess(service.saveGameRecord(req.body)));
}

function getStats(_req: Request, res: Response): void {
  res.json(formatSuccess(service.getAdminStats()));
}

export { listGames, getGame, deleteGame, importGame, getStats };
