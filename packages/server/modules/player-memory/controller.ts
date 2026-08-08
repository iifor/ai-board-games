import type { Request, Response } from 'express';
import { formatSuccess } from '../../utils/response';
import * as service from './service';

async function getStats(_request: Request, response: Response): Promise<void> {
  response.json(formatSuccess(await service.getMemoryStats()));
}

async function listMemories(request: Request, response: Response): Promise<void> {
  const { gameType, page, pageSize } = request.query as unknown as {
    gameType?: string;
    page: number;
    pageSize: number;
  };
  response.json(formatSuccess(await service.listPlayerMemories(gameType, page, pageSize)));
}

async function clearMemories(request: Request, response: Response): Promise<void> {
  const gameType = (request.body as { gameType: 'werewolf' | 'debate' | 'all' }).gameType;
  response.json(formatSuccess(await service.clearPlayerMemories(gameType)));
}

export { getStats, listMemories, clearMemories };
