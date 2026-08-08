import { Request, Response } from 'express';
import * as service from './service';
import { formatSuccess } from '../../utils/response';

async function getSettings(_req: Request, res: Response): Promise<void> {
  res.json(formatSuccess(await service.getAppSettings()));
}

async function setDefaultHost(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  res.json(formatSuccess(await service.setDefaultHostPlayerId(body.defaultHostPlayerId ?? body.playerId)));
}

async function getSpectatorMode(_req: Request, res: Response): Promise<void> {
  res.json(formatSuccess({ spectatorMode: await service.getSpectatorMode() }));
}

async function setSpectatorMode(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  res.json(formatSuccess(await service.setSpectatorMode(body.enabled)));
}

export { getSettings, setDefaultHost, getSpectatorMode, setSpectatorMode };
