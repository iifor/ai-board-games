import type { Request, Response } from 'express';
import { formatSuccess } from '../../utils/response';
import * as service from './service';

function getStats(_request: Request, response: Response): void {
  response.json(formatSuccess(service.getMemoryStats()));
}

function listMemories(request: Request, response: Response): void {
  const { gameType, page, pageSize } = request.query as unknown as {
    gameType?: string;
    page: number;
    pageSize: number;
  };
  response.json(formatSuccess(service.listPlayerMemories(gameType, page, pageSize)));
}

function clearMemories(request: Request, response: Response): void {
  const gameType = (request.body as { gameType: 'werewolf' | 'debate' | 'all' }).gameType;
  response.json(formatSuccess(service.clearPlayerMemories(gameType)));
}

export { getStats, listMemories, clearMemories };
