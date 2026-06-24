import { Request, Response } from 'express';
import * as service from './service';
import { formatSuccess } from '../../utils/response';

function getSettings(_req: Request, res: Response): void {
  res.json(formatSuccess(service.getAppSettings()));
}

function setDefaultHost(req: Request, res: Response): void {
  const body = req.body as Record<string, unknown>;
  res.json(formatSuccess(service.setDefaultHostPlayerId(body.defaultHostPlayerId ?? body.playerId)));
}

function getSpectatorMode(_req: Request, res: Response): void {
  res.json(formatSuccess({ spectatorMode: service.getSpectatorMode() }));
}

function setSpectatorMode(req: Request, res: Response): void {
  const body = req.body as Record<string, unknown>;
  res.json(formatSuccess(service.setSpectatorMode(body.enabled)));
}

export { getSettings, setDefaultHost, getSpectatorMode, setSpectatorMode };
